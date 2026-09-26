import { DIRECTIONS } from "../../../core/model/direction";
import { gridPosEquals, stepGridPos } from "../../../core/service/grid-math";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { Tile } from "../../../mapgen/model/tile";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { TileIndex } from "../../../mapgen/service/tile-index";
import type { HazardTuning } from "../../model/hazard-tuning";
import type { SitrepRule, SitrepSetupContext } from "../../model/sitrep-rule";
import type { CityAblazeTuning } from "../../model/sitrep-tuning";
import type { TacticalApplied } from "../../model/tactical-event";
import type { TacticalContext } from "../../model/tactical-handler";
import type { TacticalState } from "../../model/tactical-state";
import { FIRST_TURN } from "../../model/tactical-state";
import type { TileEffect } from "../../model/tile-effect";
import { TILE_EFFECT_ID_PREFIX } from "../../model/tile-effect";
import { coordOf } from "../missions/map-placement";
import {
  countForArea,
  deployTilesOf,
  groundNear,
  heldKeys,
  missionPoints,
  nearestDistance,
  openGround,
  spreadSites,
} from "./sitrep-placement";

// ===========================================
// Constants
// ===========================================

/** Levels a blaze may spread up or down from its centre. */
const BLAZE_RISE = 1;

// ===========================================
// City Ablaze
// ===========================================

/**
 * City Ablaze (campaign arc §11): the district is burning when the squad
 * lands, and the fires keep coming back. A setup hook lights the
 * blazes and records where they are; a phase step relights them every
 * `rekindleEvery` turns. Both use the ordinary fire tile effect, so
 * burning, sight, the renderer and the hazard reaction on entry treat
 * them exactly like a flamer's (#1121).
 *
 * ```
 *   setup
 *     candidates = open ground, no unit on it,
 *                  ≥ deployClearance from every deploy tile,
 *                  ≥ objectiveClearance from objective / extraction /
 *                    edge-spawn hook tiles, spawners and carcasses
 *     centres    = spreadSites(candidates, clamp(round(area / tilesPerBlaze)), spacing, rng)
 *     each blaze = centre + its four neighbours that are candidates too
 *     each tile  ──► fire, the hazard tuning's clock;  blazeSites = every tile
 *
 *   phase step, player phase of turn 1 + k·rekindleEvery (4, 7, 10 …)
 *     each blaze site still standing ──► fire again (clock reset if it still burns)
 * ```
 *
 * With the shipped clock of four phases a blaze lit on turn 1 burns out
 * at the start of turn 3 and flares again on turn 4. Relighting is
 * silent in the log: no unit lit it, and `EffectStarted` names one.
 *
 * @param tuning - Count, clearances, spacing and period.
 * @param hazards - The fire's clock.
 * @returns The rule for the sitrep table.
 */
export function cityAblazeSitrep(
  tuning: CityAblazeTuning,
  hazards: HazardTuning,
): SitrepRule {
  return {
    id: "city-ablaze",
    setup: (state, map, ctx) => setAblaze(state, map, ctx, tuning, hazards),
    phaseStep: (mission, ctx) => rekindle(mission, ctx, tuning, hazards),
  };
}

/**
 * Lights the blazes and records their tiles in `blazeSites`. Exported
 * for tests that check the rule apart from the table.
 *
 * @param state - The mission after its type's setup, the garrison and any earlier sitrep.
 * @param map - The generated map.
 * @param ctx - This sitrep's stream and the start's id generator.
 * @param tuning - Count, clearances and spacing.
 * @param hazards - The fire's clock.
 * @returns The mission with the fire added after any effects it had, and `blazeSites` set.
 */
export function setAblaze(
  state: TacticalState,
  map: TacticalMap,
  ctx: SitrepSetupContext,
  tuning: CityAblazeTuning,
  hazards: HazardTuning,
): TacticalState {
  const index = new TileIndex(map);
  const deploy = deployTilesOf(map);
  const points = missionPoints(state);
  const held = heldKeys(state, index);
  const alight = new Set(
    state.effects.map((effect) => index.keyOf(effect.tile)),
  );
  const candidates = openGround(map, index).filter((tile) => {
    const key = index.keyOf(tile);
    return (
      !held.has(key) &&
      !alight.has(key) &&
      nearestDistance(tile, deploy) >= tuning.deployClearance &&
      nearestDistance(tile, points) >= tuning.objectiveClearance
    );
  });
  const allowed = new Set(candidates.map((tile) => index.keyOf(tile)));
  const centres = spreadSites(
    candidates,
    countForArea(map, tuning.tilesPerBlaze, tuning.minBlazes, tuning.maxBlazes),
    tuning.spacing,
    ctx.rng,
  );
  const sites: TileCoord[] = [];
  const fire: TileEffect[] = [];
  const duration = hazards.effects.fire.duration;
  for (const centre of centres) {
    for (const tile of blazeTiles(centre, allowed, index)) {
      sites.push(coordOf(tile));
      fire.push({
        id: ctx.ids.nextId(TILE_EFFECT_ID_PREFIX),
        kind: "fire",
        tile: coordOf(tile),
        phasesLeft: duration,
      });
    }
  }
  if (sites.length === 0) {
    return state;
  }
  return {
    ...state,
    effects: [...state.effects, ...fire],
    blazeSites: [...(state.blazeSites ?? []), ...sites],
  };
}

/**
 * Relights every blaze site at the start of the player phase of turn
 * `1 + k·rekindleEvery` (k ≥ 1): a site still burning has its clock
 * reset, one that burned out gets a new fire. A site demolition took
 * away, or that nothing can stand on any more, stays dark. No draws; ids
 * from `ctx.ids`. Any other phase, or a mission with no sites, is
 * returned as it came.
 *
 * @param mission - The mission, with the new phase and turn already set.
 * @param ctx - The phase's stream and id generator.
 * @param tuning - The period.
 * @param hazards - The fire's clock.
 * @returns The mission with the fires relit, and no events.
 */
export function rekindle(
  mission: TacticalState,
  ctx: TacticalContext,
  tuning: CityAblazeTuning,
  hazards: HazardTuning,
): TacticalApplied<TacticalState> {
  const sites = mission.blazeSites ?? [];
  if (sites.length === 0 || !isRekindleTurn(mission, tuning)) {
    return { state: mission, events: [] };
  }
  const index = new TileIndex(mission.map);
  const duration = hazards.effects.fire.duration;
  const effects = [...mission.effects];
  for (const site of sites) {
    const tile = index.getAt(site);
    if (tile === undefined || tile.pass === PassMask.NONE) {
      continue;
    }
    const at = effects.findIndex(
      (effect) => effect.kind === "fire" && gridPosEquals(effect.tile, site),
    );
    const burning = at >= 0 ? effects[at] : undefined;
    if (burning !== undefined) {
      effects[at] = { ...burning, phasesLeft: duration };
      continue;
    }
    effects.push({
      id: ctx.ids.nextId(TILE_EFFECT_ID_PREFIX),
      kind: "fire",
      tile: coordOf(site),
      phasesLeft: duration,
    });
  }
  return { state: { ...mission, effects }, events: [] };
}

/**
 * Whether the phase just opened is one the blazes relight on: the
 * player phase of turn 4, 7, 10 … with the shipped period of 3.
 */
export function isRekindleTurn(
  mission: Pick<TacticalState, "phase" | "turn">,
  tuning: Pick<CityAblazeTuning, "rekindleEvery">,
): boolean {
  const since = mission.turn - FIRST_TURN;
  return (
    mission.phase === "player" &&
    since > 0 &&
    since % tuning.rekindleEvery === 0
  );
}

// ===========================================
// Helpers
// ===========================================

/** A blaze's tiles: its centre, then each same-plane neighbour that is a candidate and within one level. */
function blazeTiles(
  centre: Tile,
  allowed: ReadonlySet<number>,
  index: TileIndex,
): Tile[] {
  const tiles: Tile[] = [centre];
  for (const direction of DIRECTIONS) {
    const step = stepGridPos(centre, direction);
    const tile = groundNear(step.x, step.z, centre, BLAZE_RISE, allowed, index);
    if (tile !== undefined) {
      tiles.push(tile);
    }
  }
  return tiles;
}

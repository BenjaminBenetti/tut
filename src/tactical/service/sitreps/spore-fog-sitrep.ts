import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { Tile } from "../../../mapgen/model/tile";
import { TileIndex } from "../../../mapgen/service/tile-index";
import type { SitrepRule, SitrepSetupContext } from "../../model/sitrep-rule";
import type { SporeFogTuning } from "../../model/sitrep-tuning";
import type { TacticalState } from "../../model/tactical-state";
import type { TileEffect } from "../../model/tile-effect";
import { TILE_EFFECT_ID_PREFIX } from "../../model/tile-effect";
import { coordOf } from "../missions/map-placement";
import {
  countForArea,
  deployTilesOf,
  groundNear,
  heldKeys,
  nearestDistance,
  openGround,
  spreadSites,
} from "./sitrep-placement";

// ===========================================
// Constants
// ===========================================

/** Levels a cloud may drift up or down from its centre. */
const CLOUD_RISE = 2;

// ===========================================
// Spore Fog
// ===========================================

/**
 * Spore Fog (campaign arc §11): clouds of spores hang over the map when
 * the squad lands. A setup hook only: it lays ordinary smoke tile
 * effects, so sight, the renderer and the burn clock treat them exactly
 * like a grenade's (#1121), only longer lived.
 *
 * ```
 *   candidates = open ground ≥ deployClearance from every deploy tile, no unit on it
 *   centres    = spreadSites(candidates, round(area / tilesPerCloud) ≥ 1, spacing, rng)
 *   each cloud = every candidate within `radius` of its centre (a diamond),
 *                within two levels of it
 *   each tile  ──► smoke, phasesLeft = phases
 * ```
 *
 * Draws only from its context's stream (one shuffle). A map too
 * cramped for every cloud gets as many as fit.
 *
 * @param tuning - Count, radius, clock and clearances.
 * @returns The rule for the sitrep table.
 */
export function sporeFogSitrep(tuning: SporeFogTuning): SitrepRule {
  return {
    id: "spore-fog",
    setup: (state, map, ctx) => layFog(state, map, ctx, tuning),
  };
}

/**
 * Lays the clouds. Exported for tests that check the rule apart from
 * the table.
 *
 * @param state - The mission after its type's setup and the garrison.
 * @param map - The generated map.
 * @param ctx - This sitrep's stream and the start's id generator.
 * @param tuning - Count, radius, clock and clearances.
 * @returns The mission with the smoke added after any effects it had.
 */
export function layFog(
  state: TacticalState,
  map: TacticalMap,
  ctx: SitrepSetupContext,
  tuning: SporeFogTuning,
): TacticalState {
  const index = new TileIndex(map);
  const deploy = deployTilesOf(map);
  const held = heldKeys(state, index);
  const taken = new Set(
    state.effects
      .filter((effect) => effect.kind === "smoke")
      .map((effect) => index.keyOf(effect.tile)),
  );
  const candidates = openGround(map, index).filter(
    (tile) =>
      !held.has(index.keyOf(tile)) &&
      nearestDistance(tile, deploy) >= tuning.deployClearance,
  );
  const allowed = new Set(candidates.map((tile) => index.keyOf(tile)));
  const centres = spreadSites(
    candidates,
    countForArea(map, tuning.tilesPerCloud, 1),
    tuning.spacing,
    ctx.rng,
  );
  const smoke: TileEffect[] = [];
  for (const centre of centres) {
    for (const tile of cloudTiles(centre, tuning.radius, allowed, index)) {
      const key = index.keyOf(tile);
      if (taken.has(key)) {
        continue;
      }
      taken.add(key);
      smoke.push({
        id: ctx.ids.nextId(TILE_EFFECT_ID_PREFIX),
        kind: "smoke",
        tile: coordOf(tile),
        phasesLeft: tuning.phases,
      });
    }
  }
  return smoke.length === 0
    ? state
    : { ...state, effects: [...state.effects, ...smoke] };
}

/** The allowed ground tiles of a diamond of `radius` around `centre`, row by row. */
function cloudTiles(
  centre: Tile,
  radius: number,
  allowed: ReadonlySet<number>,
  index: TileIndex,
): Tile[] {
  const tiles: Tile[] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    const span = radius - Math.abs(dz);
    for (let dx = -span; dx <= span; dx++) {
      const tile = groundNear(
        centre.x + dx,
        centre.z + dz,
        centre,
        CLOUD_RISE,
        allowed,
        index,
      );
      if (tile !== undefined) {
        tiles.push(tile);
      }
    }
  }
  return tiles;
}

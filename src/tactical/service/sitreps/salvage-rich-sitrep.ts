import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { Tile } from "../../../mapgen/model/tile";
import type { SitrepRule, SitrepSetupContext } from "../../model/sitrep-rule";
import type { SalvageRichTuning } from "../../model/sitrep-tuning";
import type { TacticalState } from "../../model/tactical-state";
import type { TechCarcass } from "../../model/tech-carcass";
import { CARCASS_ID_PREFIX } from "../../model/tech-carcass";
import { passMaskFor } from "../../model/unit";
import { coordOf } from "../missions/map-placement";
import { buildMoveGraph, occupiedKeys } from "../movement-service";
import {
  deployTilesOf,
  missionPoints,
  nearestDistance,
  spreadSites,
} from "./sitrep-placement";

// ===========================================
// Salvage Rich
// ===========================================

/**
 * Salvage Rich (campaign arc §11, helps the player): the ground is
 * littered with dead bugs worth stripping. A setup hook only: it adds
 * `carcasses` **more** tech carcasses on top of any the offer placed
 * (#1171), so a mission that already had one ends with three. Each is
 * an ordinary `TechCarcass` — the same entity, id prefix, harvest
 * command, renderer and debrief as the offer's — priced the way the
 * offer prices its own: `basePoints + pointsPerDifficulty × difficulty`.
 *
 * The offer's carcass is placed by map generation on a hook; the extra
 * ones are placed here, on the generated map, the way the garrison is,
 * so map generation and its seeds are untouched.
 *
 * ```
 *   candidates = tiles infantry can reach from the deploy zone, not held by a unit,
 *                not a hook tile, not on fire,
 *                ≥ minFromDeploy from every deploy tile,
 *                ≥ objectiveClearance from objective hooks, extraction and live spawners
 *   preferred  = candidates in the open whose nearest deploy tile is ≤ preferWithin
 *   sites      = spreadSites(preferred, carcasses, spacing, rng, existing carcasses)
 *                then the rest of the candidates, if the preferred ran out
 * ```
 *
 * @param tuning - How many, their worth and their clearances.
 * @returns The rule for the sitrep table.
 */
export function salvageRichSitrep(tuning: SalvageRichTuning): SitrepRule {
  return {
    id: "salvage-rich",
    setup: (state, map, ctx) => scatterSalvage(state, map, ctx, tuning),
  };
}

/**
 * Places the extra carcasses. Exported for tests that check the rule
 * apart from the table. Fewer are placed when the map has no more room
 * at the spacing.
 *
 * @param state - The mission after its type's setup, the garrison and any earlier sitrep.
 * @param map - The generated map.
 * @param ctx - This sitrep's stream and the start's id generator.
 * @param tuning - How many, their worth and their clearances.
 * @returns The mission with the carcasses appended after the offer's.
 */
export function scatterSalvage(
  state: TacticalState,
  map: TacticalMap,
  ctx: SitrepSetupContext,
  tuning: SalvageRichTuning,
): TacticalState {
  const candidates = salvageCandidates(state, map, tuning);
  const existing = state.carcasses.map((carcass) => carcass.pos);
  const deploy = deployTilesOf(map);
  const preferred = new Set(
    candidates.filter(
      (tile) =>
        tile.buildingId === undefined &&
        nearestDistance(tile, deploy) <= tuning.preferWithin,
    ),
  );
  const first = spreadSites(
    [...preferred],
    tuning.carcasses,
    tuning.spacing,
    ctx.rng,
    existing,
  );
  const rest = candidates.filter((tile) => !preferred.has(tile));
  const sites = [
    ...first,
    ...spreadSites(
      rest,
      tuning.carcasses - first.length,
      tuning.spacing,
      ctx.rng,
      [...existing, ...first],
    ),
  ];
  if (sites.length === 0) {
    return state;
  }
  const techPoints =
    tuning.basePoints + tuning.pointsPerDifficulty * state.difficulty;
  const added = sites.map((site): TechCarcass => ({
    id: ctx.ids.nextId(CARCASS_ID_PREFIX),
    pos: coordOf(site),
    techPoints,
    harvested: false,
  }));
  return { ...state, carcasses: [...state.carcasses, ...added] };
}

/**
 * Every tile an extra carcass may lie on, in map order (see
 * `salvageRichSitrep`). Exported so a test can check the rule apart
 * from the draw.
 *
 * @param state - The mission the carcasses would join.
 * @param map - The generated map.
 * @param tuning - The clearances.
 * @returns The candidate tiles, in map order.
 */
export function salvageCandidates(
  state: TacticalState,
  map: TacticalMap,
  tuning: SalvageRichTuning,
): Tile[] {
  const graph = buildMoveGraph(map);
  const deploy = deployTilesOf(map);
  const reachable = graph.reachability.reachableFrom(
    deploy,
    passMaskFor("infantry"),
  );
  const held = occupiedKeys(state, graph.index);
  const hookTiles = new Set(
    [
      ...map.hooks.deployZones,
      ...map.hooks.objectives,
      ...map.hooks.edgeSpawns,
      map.hooks.extraction,
    ]
      .flatMap((hook) => hook.tiles)
      .filter((tile) => graph.index.inBounds(tile))
      .map((tile) => graph.index.keyOf(tile)),
  );
  const burning = new Set(
    state.effects
      .filter((effect) => effect.kind === "fire")
      .map((effect) => graph.index.keyOf(effect.tile)),
  );
  const carcassSites = new Set(
    state.carcasses.map((carcass) => graph.index.keyOf(carcass.pos)),
  );
  const points = missionPoints(state).filter(
    (point) => !carcassSites.has(graph.index.keyOf(point)),
  );
  return map.tiles.filter((tile) => {
    const key = graph.index.keyOf(tile);
    return (
      reachable.has(key) &&
      !held.has(key) &&
      !hookTiles.has(key) &&
      !burning.has(key) &&
      nearestDistance(tile, deploy) >= tuning.minFromDeploy &&
      nearestDistance(tile, points) >= tuning.objectiveClearance
    );
  });
}

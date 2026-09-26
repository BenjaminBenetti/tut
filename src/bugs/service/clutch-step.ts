import type { Direction } from "../../core/model/direction";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { CLUTCH_LAID } from "../../tactical/model/clutch-laid-event";
import type { PhaseStep } from "../../tactical/model/phase-step";
import type { SpawnTuning } from "../../tactical/model/spawn-tuning";
import type {
  TacticalApplied,
  TacticalEvent,
} from "../../tactical/model/tactical-event";
import type { TacticalContext } from "../../tactical/model/tactical-handler";
import type {
  Spawner,
  TacticalState,
} from "../../tactical/model/tactical-state";
import {
  DEFAULT_HATCH_RADIUS,
  SPAWNER_ID_PREFIX,
} from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import {
  footprintCentre,
  unitFootprintSize,
  unitFootprintTiles,
} from "../../tactical/service/footprint-service";
import type {
  MoveGraph,
  TileKey,
} from "../../tactical/service/movement-service";
import {
  buildMoveGraph,
  occupiedKeys,
} from "../../tactical/service/movement-service";
import { hatchInterval } from "../../tactical/service/spawn-service";
import { BROODMOTHER_TUNING } from "../data/broodmother-tuning";
import type { BroodmotherTuning } from "../model/broodmother-tuning";
import { isBroodmother } from "./broodmother-service";

// ===========================================
// Types
// ===========================================

/** What laying a clutch draws on. */
export interface ClutchDeps {
  /** The egg spawner's hit points and hatch clock: a clutch is an ordinary nest. */
  readonly spawn: SpawnTuning;
  /** Her numbers (the clutch interval); the shipped set when absent. */
  readonly tuning?: BroodmotherTuning;
}

// ===========================================
// Constants
// ===========================================

/** The way each facing points on the ground plane: `n` is −z (core `Direction`). */
const FACING: Readonly<Record<Direction, { x: number; z: number }>> = {
  n: { x: 0, z: -1 },
  e: { x: 1, z: 0 },
  s: { x: 0, z: 1 },
  w: { x: -1, z: 0 },
};

// ===========================================
// Step
// ===========================================

/**
 * The phase step that has every Broodmother lay her clutch (#1179,
 * campaign arc §6.8). Registered after the hatch and the edge wave, so
 * a new clutch starts on a full clock rather than counting down in the
 * phase it was laid.
 *
 * @param deps - The spawn tuning and her numbers.
 * @returns The step.
 */
export function createClutchStep(deps: ClutchDeps): PhaseStep {
  return (mission, ctx) => layClutches(mission, ctx, deps);
}

/**
 * Every living Broodmother lays a clutch as the bug phase of every
 * `clutchInterval`-th turn opens (arc §6.8: "every 3 turns"): one new
 * egg spawner, built exactly as a mission's nests are — the spawn
 * tuning's hit points, its hatch clock at the mission's difficulty, the
 * default hatch radius — on a free tile beside her, and a `ClutchLaid`
 * event for the log. From then on it is an ordinary nest: it hatches
 * on its clock and the squad can wreck it.
 *
 * ```
 *   bug phase, turn % clutchInterval = 0, for each living Broodmother
 *     tiles beside her block she could step to (infantry rules)
 *       − any held by a living unit − any with a live spawner on it
 *     ├─ none ──► no clutch this time
 *     └─ the one furthest behind her (the ovipositor end), first in
 *        scan order on a tie ──► Spawner { timer: hatchInterval(d) }, ClutchLaid
 * ```
 *
 * Draws no randomness; draws one spawner id per clutch from `ctx.ids`
 * and nothing at all on a mission without a Broodmother, so every
 * existing mission and sweep is untouched. A fleeing Broodmother still
 * lays: her brood covers her retreat.
 *
 * @param mission - The mission, its new phase and turn already set.
 * @param ctx - Ids for the new spawners.
 * @param deps - The spawn tuning and her numbers.
 * @returns The mission with the new clutches, and a `ClutchLaid` for each.
 */
export function layClutches(
  mission: TacticalState,
  ctx: TacticalContext,
  deps: ClutchDeps,
): TacticalApplied<TacticalState> {
  const tuning = deps.tuning ?? BROODMOTHER_TUNING;
  if (
    mission.phase !== "bugs" ||
    mission.turn % Math.max(1, tuning.clutchInterval) !== 0
  ) {
    return { state: mission, events: [] };
  }
  const mothers = mission.units.filter(
    (unit) => isBroodmother(unit) && unit.hp > 0,
  );
  if (mothers.length === 0) {
    return { state: mission, events: [] };
  }
  const graph = buildMoveGraph(mission.map);
  let state = mission;
  const events: TacticalEvent[] = [];
  for (const mother of mothers) {
    const pos = clutchTile(state, mother, graph);
    if (pos === undefined) {
      continue;
    }
    const spawner: Spawner = {
      id: ctx.ids.nextId(SPAWNER_ID_PREFIX),
      pos,
      hatchRadius: DEFAULT_HATCH_RADIUS,
      hp: deps.spawn.spawnerHp,
      timer: hatchInterval(state.difficulty, deps.spawn),
      destroyed: false,
    };
    state = { ...state, spawners: [...state.spawners, spawner] };
    events.push({
      type: CLUTCH_LAID,
      payload: { unitId: mother.id, spawnerId: spawner.id, pos },
    });
  }
  return { state, events };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The free tile beside `mother` her clutch goes on, or undefined when
 * she is boxed in: of the tiles her block could step onto, those no
 * living unit holds and no live spawner stands on, the one whose centre
 * lies furthest behind her; ties go to the first found, scanning her
 * block in footprint order and each tile's neighbours in the
 * reachability's order.
 */
function clutchTile(
  mission: TacticalState,
  mother: Unit,
  graph: MoveGraph,
): TileCoord | undefined {
  const held = occupiedKeys(mission, graph.index);
  const nests = new Set<TileKey>(
    mission.spawners
      .filter((spawner) => !spawner.destroyed)
      .filter((spawner) => graph.index.inBounds(spawner.pos))
      .map((spawner) => graph.index.keyOf(spawner.pos)),
  );
  const centre = footprintCentre(
    mother.pos,
    unitFootprintSize(mission, mother),
  );
  const ahead = FACING[mother.facing];
  let best: TileCoord | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  const seen = new Set<TileKey>();
  for (const coord of unitFootprintTiles(mission, mother)) {
    const tile = graph.index.getAt(coord);
    if (tile === undefined) {
      continue;
    }
    for (const next of graph.reachability.neighbours(tile, PassMask.INFANTRY)) {
      const key = graph.index.keyOf(next);
      if (seen.has(key) || held.has(key) || nests.has(key)) {
        continue;
      }
      seen.add(key);
      // Behind her is against her facing: the ovipositor end.
      const behind = -(
        (next.x + 0.5 - centre.x) * ahead.x +
        (next.z + 0.5 - centre.z) * ahead.z
      );
      if (behind > bestScore) {
        bestScore = behind;
        best = { x: next.x, y: next.y, z: next.z };
      }
    }
  }
  return best;
}

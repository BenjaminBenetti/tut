import type { BugSpeciesId } from "../../content/model/bug-species-id";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { BugUnitSource } from "../../tactical/model/bug-unit-source";
import { GUARDS_SUMMONED } from "../../tactical/model/guards-summoned-event";
import type { PhaseStep } from "../../tactical/model/phase-step";
import type {
  TacticalApplied,
  TacticalEvent,
} from "../../tactical/model/tactical-event";
import type { TacticalContext } from "../../tactical/model/tactical-handler";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { unitFootprintTiles } from "../../tactical/service/footprint-service";
import type {
  MoveGraph,
  TileKey,
} from "../../tactical/service/movement-service";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import { placeBugAtFirst } from "../../tactical/service/placed-bug-service";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import type { SovereignSummonTuning } from "../model/sovereign-tuning";
import { isSovereign } from "./sovereign-service";

// ===========================================
// Types
// ===========================================

/** What summoning guards draws on. */
export interface GuardSummonDeps {
  /**
   * The escort species' stat blocks by id (the composition root passes
   * a lookup over `BUG_SPECIES`), so the step reads no species
   * catalogue. An id it cannot resolve is skipped.
   */
  readonly speciesOf: (id: BugSpeciesId) => BugUnitSource | undefined;
  /** Her summons' clock, size, reach and escort; the shipped set when absent. */
  readonly summon?: SovereignSummonTuning;
}

// ===========================================
// Step
// ===========================================

/**
 * The phase step that has every Sovereign summon her guards (#1179,
 * campaign arc §9, "summon guards"). Registered with her other rules
 * after the hatch and the edge wave.
 *
 * @param deps - The escort species and her summons tuning.
 * @returns The step.
 */
export function createGuardSummonStep(deps: GuardSummonDeps): PhaseStep {
  return (mission, ctx) => summonGuards(mission, ctx, deps);
}

/**
 * Every living Sovereign calls `count` escorts as the bug phase of
 * every `interval`-th turn opens: each through the ordinary placement
 * path (`placeBugAtFirst`) on the nearest free tile within `radius`
 * infantry steps of her block, arriving with no action points — as a
 * hatchling does — so a summons is next turn's threat, not a free
 * strike this one.
 *
 * ```
 *   bug phase, turn % interval = 0, for each living Sovereign
 *     tiles within `radius` steps of her block (infantry rules),
 *       nearest first, ties in the reachability's order
 *     for i in 0 … count − 1
 *       escort[i mod |escort|] ──► placeBugAtFirst(those tiles)
 *         (skips tiles held by a unit, a buried burrower, a live
 *          spawner, a guard placed earlier, or too narrow for it)
 *     any placed ──► GuardsSummoned { unitId, guardIds }
 * ```
 *
 * Draws no randomness; draws one unit id per guard actually placed and
 * nothing at all on a mission without a Sovereign, so every existing
 * mission and sweep is untouched. A retreating Sovereign still
 * summons: the swarm is spent to protect the core (arc §9).
 *
 * @param mission - The mission, its new phase and turn already set.
 * @param ctx - Ids for the new guards.
 * @param deps - The escort species and her summons tuning.
 * @returns The mission with the new guards, and a `GuardsSummoned` for each Sovereign that placed any.
 */
export function summonGuards(
  mission: TacticalState,
  ctx: TacticalContext,
  deps: GuardSummonDeps,
): TacticalApplied<TacticalState> {
  const summon = deps.summon ?? SOVEREIGN_TUNING.summon;
  if (
    mission.phase !== "bugs" ||
    summon.count <= 0 ||
    summon.escort.length === 0 ||
    mission.turn % Math.max(1, summon.interval) !== 0
  ) {
    return { state: mission, events: [] };
  }
  const sovereigns = mission.units.filter(
    (unit) => isSovereign(unit) && unit.hp > 0,
  );
  if (sovereigns.length === 0) {
    return { state: mission, events: [] };
  }
  const graph = buildMoveGraph(mission.map);
  let state = mission;
  const events: TacticalEvent[] = [];
  for (const sovereign of sovereigns) {
    const candidates = tilesNear(state, sovereign, graph, summon.radius);
    const guardIds: UnitId[] = [];
    for (let i = 0; i < summon.count; i += 1) {
      const id = summon.escort[i % summon.escort.length];
      const species = id === undefined ? undefined : deps.speciesOf(id);
      if (species === undefined) {
        continue;
      }
      const placed = placeBugAtFirst(state, species, candidates, ctx);
      const guard = placed.units[state.units.length];
      if (placed === state || guard === undefined) {
        continue;
      }
      guardIds.push(guard.id);
      state = {
        ...placed,
        units: placed.units.map((unit): Unit =>
          unit.id === guard.id ? { ...unit, ap: 0 } : unit,
        ),
      };
    }
    if (guardIds.length > 0) {
      events.push({
        type: GUARDS_SUMMONED,
        payload: { unitId: sovereign.id, guardIds },
      });
    }
  }
  return { state, events };
}

// ===========================================
// Helpers
// ===========================================

/**
 * Tiles within `radius` infantry steps of `sovereign`'s block, nearest
 * first: a breadth-first walk out from every tile of her block over
 * the map's infantry reachability, so a guard is never placed across a
 * wall from her. Her own tiles are not candidates. Whether a tile is
 * free is `placeBugAtFirst`'s to judge, so the list is the same
 * whoever stands where; the order is the walk's, which is
 * deterministic.
 */
function tilesNear(
  mission: TacticalState,
  sovereign: Unit,
  graph: MoveGraph,
  radius: number,
): TileCoord[] {
  const own = unitFootprintTiles(mission, sovereign)
    .map((coord) => graph.index.getAt(coord))
    .filter((tile) => tile !== undefined);
  const seen = new Set<TileKey>(own.map((tile) => graph.index.keyOf(tile)));
  const found: TileCoord[] = [];
  let frontier = own;
  for (let step = 1; step <= radius && frontier.length > 0; step += 1) {
    const next: typeof frontier = [];
    for (const tile of frontier) {
      for (const near of graph.reachability.neighbours(
        tile,
        PassMask.INFANTRY,
      )) {
        const key = graph.index.keyOf(near);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        next.push(near);
        found.push({ x: near.x, y: near.y, z: near.z });
      }
    }
    frontier = next;
  }
  return found;
}

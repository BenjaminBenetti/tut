import type { Direction } from "../../core/model/direction";
import type { IdGenerator } from "../../core/model/id-generator";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { snapshotMap } from "../../mapgen/service/hatch-space";
import type { BugUnitSource } from "../model/bug-unit-source";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import type { UnitTemplate } from "../model/unit-template";
import { footprintSizeOf, footprintTiles } from "./footprint-service";
import { coordOf, facingToward } from "./missions/map-placement";
import { footprintFits, occupiedKeys } from "./movement-service";
import { buriedKeys } from "./tunnel-service";
import { bugUnit } from "./unit-factory";

// ===========================================
// Types
// ===========================================

/** What standing bugs on a map at mission start draws on. */
export interface PlacedBugDeps {
  /** Issues the new units' ids; shared with the rest of the mission start. */
  readonly ids: IdGenerator;
}

/** What `placeHiveGuards` needs: ids, and the Hive Guard's stat block. */
export interface HiveGuardPlacementDeps extends PlacedBugDeps {
  /**
   * The Hive Guard species (`BUG_SPECIES["hive-guard"]`, passed in by
   * the composition root), so this service reads no bug catalogue.
   */
  readonly guard: BugUnitSource;
}

// ===========================================
// Hive Guards
// ===========================================

/**
 * Stands one Hive Guard on each of `positions` at mission start (#1179,
 * campaign arc §6.5 and §7.5): the placement path a placed bug takes
 * instead of the weighted roll (ADR 0013 §2.6). The Hive Assault's
 * setup rule calls it with tiles beside the hive core; a guard is
 * rooted, so where it is placed is where it fights all mission.
 *
 * Positions are taken in order, and one that cannot hold a guard is
 * skipped rather than refused, as a hatchling with no room is: see
 * `placeBugsAt` for the rules.
 *
 * @param state - The mission so far; its units, templates and spawners decide what is free.
 * @param positions - Anchor tiles, in the order to try them.
 * @param deps - Ids and the guard species.
 * @returns The mission with a guard on every position that could hold one.
 */
export function placeHiveGuards(
  state: TacticalState,
  positions: readonly TileCoord[],
  deps: HiveGuardPlacementDeps,
): TacticalState {
  return placeBugsAt(state, deps.guard, positions, deps);
}

// ===========================================
// Placed bugs
// ===========================================

/**
 * Stands one bug of `species` on each position that can hold it, in
 * order: the shared placement path for bugs a mission places rather
 * than hatches (ADR 0013 §2.6). Nothing is rolled; ids are drawn only
 * for the bugs actually placed, in position order, so the same inputs
 * always place the same bugs under the same ids.
 *
 * ```
 *   for each position, in order
 *     no tile there, or the footprint does not fit infantry  ──► skipped
 *     footprint overlaps a living unit, a burrower under the ground,
 *       a live spawner, or a bug placed earlier in this call ──► skipped
 *     otherwise ──► bugUnit(species) at full hit and action points,
 *                   facing the nearest enemy (else the map's centre)
 * ```
 *
 * A burrowed unit (#1179) holds no tile on the surface
 * (`occupiedKeys` passes over it), but its column is taken here as a
 * hatchling's is (`spawn-service`): a bug stood on top of it would leave
 * it nowhere to come up. A dormant brood goes through this path too
 * (`placeDormantBrood`), so no sleeper is laid over a buried burrower.
 *
 * The bugs arrive ready (full `ap`), unlike a hatchling: they were
 * there before the squad landed. Vision is not touched; the mission
 * start computes the first look after the setup rule has run.
 *
 * Pure: never mutates `state`, draws ids from `deps` only.
 *
 * @param state - The mission so far.
 * @param species - The stat block every placed bug is built from.
 * @param positions - Footprint anchors (lowest `x`, lowest `z`), in the order to try them.
 * @param deps - The id generator.
 * @returns `state` itself when nothing could be placed, else a new mission with the bugs and their template.
 */
export function placeBugsAt(
  state: TacticalState,
  species: BugUnitSource,
  positions: readonly TileCoord[],
  deps: PlacedBugDeps,
): TacticalState {
  return placeUpTo(state, species, positions, deps, positions.length);
}

/**
 * Stands one bug of `species` on the first of `candidates` that can
 * hold it (#1179), by the rules of `placeBugsAt`: the rest are never
 * tried. For a bug a mission wants somewhere in an area rather than on
 * one exact tile — Live Specimen's lurker in the ground around a nest.
 * Both share `placeUpTo`, so a candidate over a burrower under the
 * ground is passed over here as it is there.
 *
 * ```
 *   candidates, in order ──► the first that placeBugsAt would fill ──► one bug
 *                        └─► none fits                             ──► state itself
 * ```
 *
 * Pure: never mutates `state`, draws one id from `deps` when a bug is
 * placed and none otherwise.
 *
 * @param state - The mission so far.
 * @param species - The stat block the bug is built from.
 * @param candidates - Footprint anchors, in the order to try them.
 * @param deps - The id generator.
 * @returns `state` itself when no candidate could hold the bug, else a new mission with it.
 */
export function placeBugAtFirst(
  state: TacticalState,
  species: BugUnitSource,
  candidates: readonly TileCoord[],
  deps: PlacedBugDeps,
): TacticalState {
  return placeUpTo(state, species, candidates, deps, 1);
}

// ===========================================
// Helpers
// ===========================================

/**
 * The placement both entry points share: walks `positions` in order and
 * stands a bug on each that can hold it, stopping once `limit` bugs are
 * placed. See `placeBugsAt` for what "can hold it" means.
 */
function placeUpTo(
  state: TacticalState,
  species: BugUnitSource,
  positions: readonly TileCoord[],
  deps: PlacedBugDeps,
  limit: number,
): TacticalState {
  const snapshot = snapshotMap(state.map);
  const graph = { index: snapshot.index, reachability: snapshot.reach };
  const size = footprintSizeOf(species);
  const taken = new Set(occupiedKeys(state, snapshot.index));
  for (const key of buriedKeys(state, snapshot.index)) {
    taken.add(key);
  }
  for (const spawner of state.spawners) {
    if (!spawner.destroyed && snapshot.index.inBounds(spawner.pos)) {
      taken.add(snapshot.index.keyOf(spawner.pos));
    }
  }
  const units: Unit[] = [...state.units];
  const templates: Record<string, UnitTemplate> = { ...state.templates };
  for (const position of positions) {
    if (units.length - state.units.length >= limit) {
      break;
    }
    if (!footprintFits(graph, position, size, PassMask.INFANTRY)) {
      continue;
    }
    const cells = footprintTiles(position, size).map((cell) =>
      snapshot.index.keyOf(cell),
    );
    if (cells.some((key) => taken.has(key))) {
      continue;
    }
    const built = bugUnit(
      species,
      { pos: coordOf(position), facing: facingOf(position, state) },
      deps,
    );
    for (const key of cells) {
      taken.add(key);
    }
    units.push(built.unit);
    templates[built.template.id] ??= built.template;
  }
  return units.length === state.units.length
    ? state
    : { ...state, units, templates };
}

/**
 * The direction a placed bug starts facing: toward the nearest living
 * unit of another side — at mission start, the squad's landing — along
 * the dominant axis, so a guard is watching the way intruders come.
 * With nobody else on the map, toward the map's centre.
 */
function facingOf(position: TileCoord, state: TacticalState): Direction {
  let nearest: TileCoord | undefined;
  let best = Number.POSITIVE_INFINITY;
  for (const unit of state.units) {
    if (unit.team === "bugs" || unit.hp <= 0) {
      continue;
    }
    const distance =
      Math.abs(unit.pos.x - position.x) + Math.abs(unit.pos.z - position.z);
    if (distance < best) {
      best = distance;
      nearest = unit.pos;
    }
  }
  if (nearest === undefined) {
    return facingToward(position, state.map);
  }
  const dx = nearest.x - position.x;
  const dz = nearest.z - position.z;
  if (dx === 0 && dz === 0) {
    return "s";
  }
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx > 0 ? "e" : "w";
  }
  return dz > 0 ? "s" : "n";
}

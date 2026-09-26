import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type {
  ObjectiveDestination,
  ObjectiveTarget,
} from "../../model/objective-rules";
import type {
  DestroyPodObjective,
  DestroySpawnerObjective,
  Objective,
  Spawner,
  SpawnerId,
  TacticalState,
} from "../../model/tactical-state";

// ===========================================
// Wreck objectives
// ===========================================

/**
 * An objective whose job is to wreck one spawner-like target on a tile:
 * an egg spawner's `destroy-spawner`, a spore pod's `destroy-pod`. They
 * share how the target is found, worked with charges, blipped in the
 * fog and credited when it falls; what differs (a deadline, a burst) is
 * in each kind's own module.
 *
 * ```
 *   destroy-spawner ──┐
 *                     ├── targetId ──► mission.spawners
 *   destroy-pod     ──┘
 * ```
 */
export type WreckObjective = DestroySpawnerObjective | DestroyPodObjective;

/**
 * The kinds that are wreck objectives. Kept beside the type so the two
 * cannot drift: a kind in one and not the other fails to compile.
 */
const WRECK_KINDS: Readonly<Record<WreckObjective["kind"], true>> = {
  "destroy-spawner": true,
  "destroy-pod": true,
};

/**
 * True when the objective is a wreck objective.
 *
 * @param objective - Any objective.
 */
export function isWreckObjective(
  objective: Objective,
): objective is WreckObjective {
  return Object.hasOwn(WRECK_KINDS, objective.kind);
}

// ===========================================
// Completion by wrecking
// ===========================================

/**
 * The objectives that wrecking `spawnerId` completes: every open wreck
 * objective tracking it. `damageSpawner` asks this the moment a
 * spawner's hit points run out, whether charges, gunfire or a fire did
 * it.
 *
 * A failed objective stays failed: a spawner wrecked after its deadline
 * is still a wreck, but the job it was is lost, and the two flags are
 * never both set. (A matured pod is already gone, so it cannot be
 * wrecked at all.)
 *
 * This module imports no service, so `damageSpawner` can read it without
 * the import cycle a lookup through `OBJECTIVE_RULES` would close.
 *
 * @param objectives - The mission's objectives, in order.
 * @param spawnerId - The spawner just destroyed.
 * @returns The objectives to mark complete, in objective order.
 */
export function spawnerObjectivesCleared(
  objectives: readonly Objective[],
  spawnerId: SpawnerId,
): readonly WreckObjective[] {
  return objectives.filter(
    (objective): objective is WreckObjective =>
      isWreckObjective(objective) &&
      objective.targetId === spawnerId &&
      !objective.complete &&
      objective.failed !== true,
  );
}

// ===========================================
// Shared rule pieces
// ===========================================

/**
 * The spawner the objective tracks, if it is on the map.
 *
 * @param objective - A wreck objective.
 * @param mission - The mission it belongs to.
 */
export function wreckTarget(
  objective: WreckObjective,
  mission: TacticalState,
): Spawner | undefined {
  return mission.spawners.find(
    (candidate) => candidate.id === objective.targetId,
  );
}

/**
 * The target to plant charges on, until it is destroyed or gone.
 *
 * @param objective - A wreck objective.
 * @param mission - The mission it belongs to.
 */
export function wreckReachable(
  objective: WreckObjective,
  mission: TacticalState,
): ObjectiveTarget | undefined {
  const spawner = wreckTarget(objective, mission);
  return spawner === undefined || spawner.destroyed
    ? undefined
    : { id: spawner.id, pos: spawner.pos };
}

/**
 * The target's tile while it stands (#1173): location only, never its
 * health.
 *
 * @param objective - A wreck objective.
 * @param mission - The mission it belongs to.
 */
export function wreckMarker(
  objective: WreckObjective,
  mission: TacticalState,
): TileCoord | undefined {
  const spawner = wreckTarget(objective, mission);
  return spawner === undefined || spawner.destroyed || spawner.hp <= 0
    ? undefined
    : spawner.pos;
}

/**
 * Where the target is or was: its location is public intel, its health
 * is not.
 *
 * @param objective - A wreck objective.
 * @param mission - The mission it belongs to.
 */
export function wreckDestination(
  objective: WreckObjective,
  mission: TacticalState,
): ObjectiveDestination {
  return { position: wreckTarget(objective, mission)?.pos };
}

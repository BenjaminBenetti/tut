import { OBJECTIVE_UPDATED } from "../model/objective-updated-event";
import { SPAWNER_DAMAGED } from "../model/spawner-damaged-event";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type {
  Objective,
  Spawner,
  SpawnerId,
  TacticalState,
} from "../model/tactical-state";
import { spawnerObjectivesCleared } from "./objectives/wreck-objectives";

// ===========================================
// Spawner damage
// ===========================================

/**
 * Takes `damage` off an egg spawner or spore pod and, when that empties
 * it, destroys it and completes the objective tracking it (GDD §5.4,
 * campaign arc §6.3). The one place a spawner loses hit points, so
 * planted charges (#330), gunfire (#426), blasts and fire cannot drift
 * apart:
 *
 * ```
 *   hp − damage, never below zero ──► SpawnerDamaged { damage, hp, destroyed }
 *          │
 *          └─ hp reaches 0 ──► destroyed, the open wreck objectives
 *                              (destroy-spawner, destroy-pod) tracking it
 *                              (spawnerObjectivesCleared)
 *                              marked complete ──► ObjectiveUpdated
 * ```
 *
 * Pure, and deliberately silent about whether the mission is now over:
 * the caller bills its own action and asks `endIfOver`, because a shot
 * and a charge pay for themselves differently. An unknown or already
 * destroyed spawner leaves the mission untouched with no events, so the
 * caller's own validation stays responsible for rejecting that.
 *
 * @param mission - The mission the spawner belongs to; never mutated.
 * @param spawnerId - The spawner taking the damage.
 * @param damage - Hit points to remove; zero or less is a no-op.
 * @param actorId - The unit that dealt the damage, recorded on the event.
 */
export function damageSpawner(
  mission: TacticalState,
  spawnerId: SpawnerId,
  damage: number,
  actorId: string,
): TacticalApplied<TacticalState> {
  const spawner = mission.spawners.find(
    (candidate) => candidate.id === spawnerId,
  );
  if (spawner === undefined || spawner.destroyed || damage <= 0) {
    return { state: mission, events: [] };
  }
  const hp = Math.max(0, spawner.hp - damage);
  const destroyed = hp <= 0;
  const damaged: Spawner = { ...spawner, hp, destroyed };
  const events: TacticalEvent[] = [
    {
      type: SPAWNER_DAMAGED,
      payload: {
        spawnerId: spawner.id,
        unitId: actorId,
        damage: spawner.hp - hp,
        hp,
        destroyed,
        ...(spawner.variant === undefined ? {} : { variant: spawner.variant }),
      },
    },
  ];
  // Which objectives a wreck completes is the wreck kinds' rule (ADR
  // 0013 §2.3), not this service's.
  const cleared: readonly Objective[] = destroyed
    ? spawnerObjectivesCleared(mission.objectives, spawner.id)
    : [];
  for (const objective of cleared) {
    events.push({
      type: OBJECTIVE_UPDATED,
      payload: { objectiveId: objective.id, complete: true },
    });
  }
  return {
    state: {
      ...mission,
      spawners: mission.spawners.map((candidate) =>
        candidate.id === spawner.id ? damaged : candidate,
      ),
      objectives: destroyed
        ? mission.objectives.map((objective): Objective =>
            cleared.includes(objective)
              ? { ...objective, complete: true }
              : objective,
          )
        : mission.objectives,
    },
    events,
  };
}

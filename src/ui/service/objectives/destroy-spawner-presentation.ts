import type { DestroySpawnerObjective } from "../../../tactical/model/tactical-state";
import type {
  ObjectivePresentation,
  ObjectiveRow,
  ObjectiveRowContext,
} from "../../model/objective-presentation";
import { formatWhole } from "../format";

// ===========================================
// Presentation
// ===========================================

/**
 * Destroy an egg spawner (GDD §5.4). Named by its ordinal, never by the
 * spawner's id (#949): "Destroy spawner spawner-1" said nothing about
 * which nest it was and wrapped onto a second line. The id stays on
 * `data-target-id` for the scene and for tests.
 *
 * ```
 *   ✓ Destroyed spawner 1
 *   ○ Destroy spawner 2   20 hp   in reach
 * ```
 */
export const DESTROY_SPAWNER_PRESENTATION: ObjectivePresentation<"destroy-spawner"> =
  {
    kind: "destroy-spawner",
    name: spawnerName,
    row: spawnerRow,
    trackedId: spawnerId,
  };

// ===========================================
// Helpers
// ===========================================

/** "spawner 2": the objective's one-based place in the mission. */
function spawnerName(
  _objective: DestroySpawnerObjective,
  ordinal: number,
): string {
  return `spawner ${String(ordinal)}`;
}

/**
 * The row: `check` once the spawner is wrecked and `egg` while it
 * stands, the label in the matching tense, and the hit points left on a
 * spawner still standing. The word carries the state for a screen
 * reader, since the glyph beside it is decorative (#495).
 */
function spawnerRow(
  objective: DestroySpawnerObjective,
  ctx: ObjectiveRowContext,
): ObjectiveRow {
  const spawner = ctx.spawners.find((s) => s.id === objective.targetId);
  return {
    icon: objective.complete ? "check" : "egg",
    label: `${objective.complete ? "Destroyed" : "Destroy"} ${spawnerName(objective, ctx.ordinal)}`,
    // The spawner the objective tracks, so a test can name the thing on
    // the map that has to come down (#484).
    data: { targetId: objective.targetId },
    layout: "inline",
    ...(spawner && !spawner.destroyed
      ? { detail: { text: `${formatWhole(spawner.hp)} hp` } }
      : {}),
  };
}

/** The spawner's id, which `target-destroyed` carries instead of the objective's. */
function spawnerId(objective: DestroySpawnerObjective): string {
  return objective.targetId;
}

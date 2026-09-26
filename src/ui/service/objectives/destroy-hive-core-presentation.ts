import type { DestroyHiveCoreObjective } from "../../../tactical/model/tactical-state";
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
 * Bring down the hive core and get out (campaign arc §6.5, #1179). A
 * cavern has one core, so it is "the hive core" rather than an ordinal.
 * The row shows the core's hit points against its full health while it
 * stands, so a squad planting charges sees each one land; once it falls
 * the row is done, and the tracker's extraction line says what is left.
 *
 * ```
 *   ⬡ Destroy the hive core       60 / 90 hp
 *   ✓ Destroyed the hive core
 *   ⚠ The assault failed: the hive stands
 * ```
 */
export const DESTROY_HIVE_CORE_PRESENTATION: ObjectivePresentation<"destroy-hive-core"> =
  {
    kind: "destroy-hive-core",
    name: coreName,
    row: coreRow,
    trackedId: coreId,
  };

// ===========================================
// Helpers
// ===========================================

/** "the hive core": a cavern has one. */
function coreName(): string {
  return "the hive core";
}

/**
 * The row: `check` once the core fell, `warning` once the assault
 * failed, the hive glyph while it stands, the label in the matching
 * tense, and `hp / maxHp` on a core still standing.
 */
function coreRow(
  objective: DestroyHiveCoreObjective,
  ctx: ObjectiveRowContext,
): ObjectiveRow {
  const core = ctx.spawners.find((s) => s.id === objective.targetId);
  const failed = objective.failed === true && !objective.complete;
  return {
    icon: objective.complete ? "check" : failed ? "warning" : "marker-hive",
    label: objective.complete
      ? "Destroyed the hive core"
      : failed
        ? "The assault failed: the hive stands"
        : "Destroy the hive core",
    data: { targetId: objective.targetId },
    layout: "inline",
    ...(core && !core.destroyed
      ? {
          detail: {
            text: `${formatWhole(core.hp)} / ${formatWhole(core.maxHp ?? core.hp)} hp`,
            role: "hive-core-hp",
          },
        }
      : {}),
  };
}

/** The core's id, which `target-destroyed` carries instead of the objective's. */
function coreId(objective: DestroyHiveCoreObjective): string {
  return objective.targetId;
}

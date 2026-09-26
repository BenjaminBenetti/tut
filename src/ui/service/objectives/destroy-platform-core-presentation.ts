import type { DestroyPlatformCoreObjective } from "../../../tactical/model/tactical-state";
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
 * Destroy the platform core (campaign arc §6.9), the finale's win. One
 * core, so it is "the platform core". The row carries the core's hit
 * points against its whole, so the squad sees how far it is down while
 * the Sovereign stands in the way. The count sits under the label
 * (`stacked`): "140 / 200 hp" beside a label this long squeezes it to a
 * word a line in the tracker.
 *
 * ```
 *   ◉ Destroy the platform core
 *       140 / 200 hp
 *   ✓ Destroyed the platform core
 * ```
 */
export const DESTROY_PLATFORM_CORE_PRESENTATION: ObjectivePresentation<"destroy-platform-core"> =
  {
    kind: "destroy-platform-core",
    name: () => "the platform core",
    row: coreRow,
    trackedId: (objective) => objective.targetId,
  };

// ===========================================
// Helpers
// ===========================================

/** The row: `check` once the core is wrecked, `pod` while it stands, with its hit points. */
function coreRow(
  objective: DestroyPlatformCoreObjective,
  ctx: ObjectiveRowContext,
): ObjectiveRow {
  const core = ctx.spawners.find((s) => s.id === objective.targetId);
  if (objective.complete) {
    return {
      icon: "check",
      label: "Destroyed the platform core",
      data: { targetId: objective.targetId },
      layout: "inline",
    };
  }
  return {
    icon: "pod",
    label: "Destroy the platform core",
    data: { targetId: objective.targetId },
    layout: "stacked",
    ...(core && !core.destroyed
      ? {
          detail: {
            text: `${formatWhole(Math.max(0, core.hp))} / ${formatWhole(objective.coreHp)} hp`,
            role: "platform-core-hp",
          },
        }
      : {}),
  };
}

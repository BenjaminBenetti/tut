import type { BoardCoreObjective } from "../../../tactical/model/tactical-state";
import type {
  ObjectivePresentation,
  ObjectiveRow,
} from "../../model/objective-presentation";

// ===========================================
// Presentation
// ===========================================

/**
 * Fight through the Spore Platform's hull and board the core (campaign
 * arc §6.9). One hatch to a hull, so it is "the hatch" rather than an
 * ordinal. The row ticks the moment the first unit is through (the
 * objective's `onExtracted` sets the flag), and says the rest of the
 * force may follow: everyone who boards fights on in the core. The
 * detail is words, not a count, so it sits under the label (`stacked`):
 * beside it, it squeezes the label to a word a line in the tracker.
 *
 * ```
 *   ⇥ Reach the hatch and board the core
 *       extract at the hatch
 *   ✓ Boarded the core
 *       the rest may follow
 *   ⚠ Nobody reached the hatch
 * ```
 */
export const BOARD_CORE_PRESENTATION: ObjectivePresentation<"board-core"> = {
  kind: "board-core",
  name: () => "the hatch",
  row: boardRow,
};

// ===========================================
// Helpers
// ===========================================

/** The row: `check` once someone is aboard, `warning` once nobody can be, `extract` while open. */
function boardRow(objective: BoardCoreObjective): ObjectiveRow {
  if (objective.complete) {
    return {
      icon: "check",
      label: "Boarded the core",
      data: {},
      layout: "stacked",
      detail: { text: "the rest may follow", role: "board-core-detail" },
    };
  }
  if (objective.failed === true) {
    return {
      icon: "warning",
      label: "Nobody reached the hatch",
      data: {},
      layout: "inline",
    };
  }
  return {
    icon: "extract",
    label: "Reach the hatch and board the core",
    data: {},
    layout: "stacked",
    detail: { text: "extract at the hatch", role: "board-core-detail" },
  };
}

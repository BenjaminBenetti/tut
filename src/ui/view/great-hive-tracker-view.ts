import { greatHiveTally } from "../../overworld/model/great-hive";
import type { OverworldState } from "../../overworld/model/overworld-state";
import { formatWhole } from "../service/format";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// GreatHiveTrackerView
// ===========================================

/**
 * The top bar's Great Hive count (campaign arc §6.9, #1179): how many of
 * the Spore Platform's three beacons are down, from the reveal until the
 * campaign ends. Hidden before the reveal and once the campaign has an
 * outcome, so a new game's bar and an ended campaign's outcome badge
 * keep the 800 px budget they were measured at.
 *
 * ```
 *   ◆ GREAT HIVES 1 / 3          ≥ 1024 px
 *   ◆ 1 / 3                      narrow: the label drops, like every stat's
 * ```
 */
export class GreatHiveTrackerView {
  // ===========================================
  // Fields
  // ===========================================

  private stat: HTMLElement | undefined;
  private value: HTMLElement | undefined;

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Builds the hidden stat in the top bar's own markup and returns it for
   * the bar to place; call `update` to fill and show it.
   */
  create(doc: Document): HTMLElement {
    const stat = doc.createElement("span");
    stat.className = "tut-topbar__stat";
    stat.dataset.role = "great-hives";
    stat.hidden = true;
    const term = doc.createElement("span");
    term.className = "tut-label";
    term.textContent = "Great Hives";
    const value = doc.createElement("span");
    value.className = "tut-data";
    value.dataset.field = "great-hives";
    value.textContent = "—";
    // The glyph is decorative: the label stays the accessible name (#495).
    stat.append(iconGlyph(doc, "marker-hive"), term, value);
    this.stat = stat;
    this.value = value;
    return stat;
  }

  /**
   * Shows "destroyed / total" while the Great Hives are revealed and the
   * campaign runs; hides the stat otherwise.
   */
  update(
    overworld: Pick<OverworldState, "greatHives" | "outcome"> | undefined,
  ): void {
    if (!this.stat || !this.value) {
      return;
    }
    const tally =
      overworld === undefined || overworld.outcome !== undefined
        ? undefined
        : greatHiveTally(overworld);
    if (tally === undefined) {
      this.stat.hidden = true;
      return;
    }
    const text = `${formatWhole(tally.destroyed)} / ${formatWhole(tally.total)}`;
    if (this.value.textContent !== text) {
      this.value.textContent = text;
    }
    this.stat.title = `Great Hives destroyed: ${text}. All three open the launch window.`;
    this.stat.hidden = false;
  }

  /** Forgets the stat; the bar removes it with itself. */
  release(): void {
    this.stat = undefined;
    this.value = undefined;
  }
}

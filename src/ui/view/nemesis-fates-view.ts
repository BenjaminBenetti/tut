import type { NemesisFate } from "../../overworld/model/outcome-chronicle";
import { nemesisFateText } from "../service/chronicle-text";

// ===========================================
// Constants
// ===========================================

/** What the list says when no nemesis ever rose. */
export const NO_NEMESES = "No nemesis rose against the TDF.";

// ===========================================
// NemesisFatesView
// ===========================================

/**
 * The nemeses on the end screen (campaign arc §9, §13): each named bug
 * that hunted the squad, killed on a day or still out there, in the
 * order the summary froze them (the killed first).
 *
 * ```
 *   NEMESES
 *   Old Scald: killed on day 52        data-fate="killed"
 *   Grey Widow: still out there        data-fate="alive"
 * ```
 */
export class NemesisFatesView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Draws the fates of `nemeses` at the end of `parent`. */
  mount(parent: HTMLElement, nemeses: readonly NemesisFate[]): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement("section");
    root.className = "tut-nemeses";
    root.dataset.role = "nemeses";
    const heading = doc.createElement("h2");
    heading.className = "tut-label tut-nemeses__heading";
    heading.textContent = "Nemeses";
    root.appendChild(heading);
    if (nemeses.length === 0) {
      const none = doc.createElement("p");
      none.className = "tut-dim";
      none.textContent = NO_NEMESES;
      root.appendChild(none);
    } else {
      const list = doc.createElement("ul");
      list.className = "tut-nemeses__list";
      for (const fate of nemeses) {
        const item = doc.createElement("li");
        item.className = "tut-nemeses__fate";
        item.dataset.nemesis = fate.id;
        item.dataset.fate = fate.killedDay === undefined ? "alive" : "killed";
        item.textContent = nemesisFateText(fate);
        list.appendChild(item);
      }
      root.appendChild(list);
    }
    parent.appendChild(root);
    this.root = root;
  }

  /** Removes the list. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
  }
}

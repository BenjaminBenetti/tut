import type { Result } from "../../core/model/result";
import type { LoadoutError } from "../../roster/model/loadout-error";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import { formatCredits, formatWhole } from "../service/format";

// ===========================================
// Constants
// ===========================================

/** Sheet rows in display order with their labels. */
/**
 * The sheet fields this view renders. Numeric only: the sheet also
 * carries `weapons` (#532), which is a list for the tactical layer and
 * not a stat to print in a row.
 */
type StatKey = {
  [K in keyof MechStatSheet]: MechStatSheet[K] extends number ? K : never;
}[keyof MechStatSheet];

const ROWS: readonly [StatKey, string][] = [
  ["armor", "Armor"],
  ["mobility", "Mobility"],
  ["heat", "Heat"],
  ["accuracy", "Accuracy"],
  ["firepower", "Firepower"],
  ["weight", "Weight"],
  ["powerBalance", "Power balance"],
  ["combatRating", "Combat rating"],
  ["totalCost", "Total cost"],
];

// ===========================================
// StatSheetView
// ===========================================

/**
 * The mech bay's right half: the validated stat sheet with total cost
 * and combat rating, or the list of reasons the draft is not buildable.
 * Values show dashes while the draft is invalid, since there is no sheet
 * to show; the errors also render beside their slots in the editor.
 */
export class StatSheetView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private values = new Map<StatKey, HTMLElement>();
  private verdict: HTMLElement | undefined;
  private errors: HTMLElement | undefined;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("aside");
    panel.id = "stat-sheet";
    panel.className = "tut-panel tut-mech-bay__sheet";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Stat sheet";

    const verdict = doc.createElement("span");
    verdict.className = "tut-badge";
    verdict.dataset.field = "verdict";

    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    for (const [key, label] of ROWS) {
      const term = doc.createElement("dt");
      term.className = "tut-label";
      term.textContent = label;
      const value = doc.createElement("dd");
      value.className = "tut-data";
      value.dataset.field = key;
      value.textContent = "—";
      grid.append(term, value);
      this.values.set(key, value);
    }

    const errors = doc.createElement("ul");
    errors.className = "tut-list tut-mech-bay__errors";
    errors.dataset.role = "errors";
    errors.hidden = true;

    panel.append(title, verdict, grid, errors);
    parent.appendChild(panel);
    this.root = panel;
    this.verdict = verdict;
    this.errors = errors;
  }

  /** Shows the sheet on success, or dashes plus every error on failure. */
  update(result: Result<MechStatSheet, LoadoutError[]>): void {
    if (!this.verdict || !this.errors) {
      return;
    }
    if (result.ok) {
      const sheet = result.value;
      for (const [key, el] of this.values) {
        el.textContent =
          key === "totalCost"
            ? formatCredits(sheet[key])
            : formatWhole(sheet[key]);
      }
      this.verdict.textContent = "Buildable";
      this.verdict.className = "tut-badge tut-badge--ok";
      this.verdict.dataset.tone = "ok";
      this.errors.replaceChildren();
      this.errors.hidden = true;
      return;
    }
    for (const el of this.values.values()) {
      el.textContent = "—";
    }
    this.verdict.textContent = `Not buildable · ${formatWhole(result.error.length)} issue${result.error.length === 1 ? "" : "s"}`;
    this.verdict.className = "tut-badge tut-badge--danger";
    this.verdict.dataset.tone = "danger";
    const doc = this.errors.ownerDocument;
    this.errors.replaceChildren(
      ...result.error.map((error) => {
        const item = doc.createElement("li");
        item.dataset.code = error.code;
        if (error.slot) {
          item.dataset.slot = error.slot;
        }
        item.textContent = error.detail;
        return item;
      }),
    );
    this.errors.hidden = false;
  }

  /** Removes the panel. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.values = new Map<StatKey, HTMLElement>();
    this.verdict = undefined;
    this.errors = undefined;
  }
}

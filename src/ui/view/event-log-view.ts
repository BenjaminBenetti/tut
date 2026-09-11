import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { GameState } from "../../save/model/game-state";
import { formatWhole } from "../service/format";
import { namesFor } from "../service/tactical-error-text";
import { describeEvent } from "./event-vocabulary";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Types
// ===========================================

// ===========================================
// Constants
// ===========================================

/** Lines kept in the scrollback. A long mission is a few hundred events. */
const MAX_ENTRIES = 200;

/** Remembered for the session so the log does not reopen on every mission. */
let collapsedForSession = false;

// ===========================================
// Phrasing
// ===========================================

// ===========================================
// EventLogView
// ===========================================

/**
 * The mission's event log, bottom left, collapsible (#525). Every tactical
 * event the player can act on, phrased as a sentence and kept in order so a
 * fight can be reviewed after it has scrolled past.
 *
 * ```
 *   ┌─ EVENT LOG ──────────── ▾ ┐
 *   │ ▸ Turn 4 — bug phase      │
 *   │ ▸ Swarmer hit Alpha for 3 │
 *   │ ▸ Alpha missed Swarmer    │  newest last, scrolled to the bottom
 *   └───────────────────────────┘
 * ```
 *
 * It is a view over the existing event stream: nothing is logged twice, and
 * the phrasing table above is the only place that knows what an event means.
 */
export class EventLogView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private toggle: HTMLButtonElement | undefined;
  private count = 0;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the log under `parent`; call `append` as events arrive. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.id = "event-log";
    section.className = "tut-panel tut-hud__log";
    section.dataset.collapsed = String(collapsedForSession);

    const header = doc.createElement("div");
    header.className = "tut-log__header";
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Event log";
    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "tut-btn tut-log__toggle";
    toggle.dataset.action = "toggle-log";
    toggle.addEventListener("click", () => {
      this.setCollapsed(!collapsedForSession);
    });
    header.append(title, toggle);

    const list = doc.createElement("ol");
    list.className = "tut-log__list";
    list.dataset.role = "event-log-list";

    section.append(header, list);
    parent.appendChild(section);
    this.root = section;
    this.list = list;
    this.toggle = toggle;
    this.setCollapsed(collapsedForSession);
  }

  /** Removes the log and forgets its nodes; the collapsed state survives. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.toggle = undefined;
    this.count = 0;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Appends the lines for `events`, oldest first, and scrolls to the newest.
   * Events with nothing to say are skipped.
   *
   * @param events - The batch that just resolved.
   * @param mission - Mission state, for unit names.
   */
  append(
    events: readonly TacticalEvent[],
    mission: TacticalState | undefined,
    campaign?: GameState,
  ): void {
    const list = this.list;
    if (!list || events.length === 0) {
      return;
    }
    // The same resolver the indicator above the unit uses (#1029), so the
    // two name a thing identically -- an egg spawner included, which
    // `target` names by the tracker's ordinal (#1072).
    const names = namesFor(mission, campaign);
    const doc = list.ownerDocument;
    for (const event of events) {
      const entry = describeEvent(event, names);
      if (!entry) {
        continue;
      }
      const last = list.lastElementChild;
      if (last instanceof HTMLElement && last.dataset.text === entry.text) {
        // A bug phase is forty identical move lines; collapsing them keeps
        // the fight visible instead of burying it (#525).
        const seen = Number(last.dataset.repeat ?? "1") + 1;
        last.dataset.repeat = String(seen);
        const tail = last.querySelector<HTMLElement>('[data-field="repeat"]');
        if (tail) {
          tail.textContent = ` ×${formatWhole(seen)}`;
        }
        continue;
      }
      const row = doc.createElement("li");
      row.className = `tut-log__row tut-log__row--${entry.tone}`;
      row.dataset.text = entry.text;
      const icon = iconGlyph(doc, entry.icon);
      const text = doc.createElement("span");
      text.textContent = entry.text;
      const repeat = doc.createElement("span");
      repeat.className = "tut-dim";
      repeat.dataset.field = "repeat";
      row.append(icon, text, repeat);
      list.appendChild(row);
      this.count += 1;
    }
    while (this.count > MAX_ENTRIES && list.firstElementChild) {
      list.firstElementChild.remove();
      this.count -= 1;
    }
    list.scrollTop = list.scrollHeight;
  }

  /** Empties the log, for a new mission. */
  clear(): void {
    if (this.list) {
      this.list.textContent = "";
    }
    this.count = 0;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Collapses to the header handle, or opens it again, and remembers which. */
  private setCollapsed(collapsed: boolean): void {
    collapsedForSession = collapsed;
    if (this.root) {
      this.root.dataset.collapsed = String(collapsed);
    }
    if (this.toggle) {
      this.toggle.textContent = collapsed ? "▴" : "▾";
      this.toggle.setAttribute(
        "aria-label",
        collapsed ? "Expand event log" : "Collapse event log",
      );
      this.toggle.setAttribute("aria-expanded", String(!collapsed));
    }
  }
}

// ===========================================
// Helpers
// ===========================================

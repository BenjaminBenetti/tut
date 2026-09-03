import type { GraveyardEntry } from "../../roster/model/roster-state";
import { formatWhole } from "../service/format";

// ===========================================
// GraveyardView
// ===========================================

/**
 * The roster's memorial: every squad wiped and mech destroyed, newest
 * first, with the day and mission it was lost in (GDD §2). Read-only.
 */
export class GraveyardView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private empty: HTMLElement | undefined;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("section");
    panel.id = "graveyard";
    panel.className = "tut-panel tut-roster__panel";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Graveyard";

    const list = doc.createElement("ul");
    list.className = "tut-list";

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-losses";
    empty.textContent = "No losses. Keep it that way.";

    panel.append(title, list, empty);
    parent.appendChild(panel);
    this.root = panel;
    this.list = list;
    this.empty = empty;
  }

  /** Rebuilds the memorial from `graveyard`, newest loss first. */
  update(graveyard: readonly GraveyardEntry[]): void {
    if (!this.list || !this.empty) {
      return;
    }
    const doc = this.list.ownerDocument;
    this.list.replaceChildren(
      ...[...graveyard].reverse().map((entry) => {
        const item = doc.createElement("li");
        item.dataset.kind = entry.kind;
        item.textContent = `${entry.name} · ${entry.kind} · day ${formatWhole(entry.day)} · ${entry.missionId}`;
        return item;
      }),
    );
    this.empty.hidden = graveyard.length > 0;
  }

  /** Removes the panel. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.empty = undefined;
  }
}

import type { GameState } from "../../save/model/game-state";
import type { NemesisRow } from "../service/nemesis-rows";
import { nemesisRows } from "../service/nemesis-rows";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// NemesesView
// ===========================================

/**
 * The overworld's Nemeses readout (campaign arc §6.8, §8, #1179): every
 * named enemy the campaign remembers, one small block each, with its
 * name and level, its species and region, and the scar the squad gave
 * it. It sits in the side panel, not the top bar, and is hidden while
 * the record is empty, which is most of a campaign.
 *
 * ```
 *   ┌ NEMESES ───────────────────────────┐
 *   │ ♛ Old Scald               Level 2  │
 *   │   Broodmother · East Asia          │
 *   │   burned along the flank           │
 *   └────────────────────────────────────┘
 * ```
 *
 * Rebuilt only when the rows change, so a day's tick that leaves the
 * record alone touches nothing.
 */
export class NemesesView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private shownKey: string | undefined;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the hidden section under `parent`; `update` fills it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.className = "tut-nemeses";
    section.dataset.role = "nemeses";
    section.hidden = true;
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Nemeses";
    const list = doc.createElement("ul");
    list.className = "tut-list tut-nemeses__list";
    section.append(title, list);
    parent.appendChild(section);
    this.root = section;
    this.list = list;
  }

  /** Shows the campaign's nemeses, or hides the section when it has none. */
  update(state: GameState | undefined): void {
    if (!this.root || !this.list) {
      return;
    }
    const rows = nemesisRows(state);
    this.root.hidden = rows.length === 0;
    const key = JSON.stringify(rows);
    if (key === this.shownKey) {
      return;
    }
    this.shownKey = key;
    const doc = this.list.ownerDocument;
    this.list.replaceChildren(...rows.map((row) => nemesisItem(doc, row)));
  }

  /** Removes the section. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.shownKey = undefined;
  }
}

// ===========================================
// Helpers
// ===========================================

/** One nemesis: the crown, name and level on a line, then where and the scar. */
function nemesisItem(doc: Document, row: NemesisRow): HTMLElement {
  const item = doc.createElement("li");
  item.className = "tut-nemesis";
  item.dataset.nemesisId = row.id;
  const head = doc.createElement("div");
  head.className = "tut-nemesis__head";
  const name = doc.createElement("span");
  name.className = "tut-nemesis__name";
  name.dataset.field = "nemesis-name";
  name.textContent = row.name;
  const level = doc.createElement("span");
  level.className = "tut-mono";
  level.dataset.field = "nemesis-level";
  level.textContent = row.level;
  head.append(iconGlyph(doc, "nemesis"), name, level);
  const where = doc.createElement("div");
  where.className = "tut-dim";
  where.dataset.field = "nemesis-where";
  where.textContent = row.where;
  const scar = doc.createElement("div");
  scar.className = "tut-dim tut-nemesis__scar";
  scar.dataset.field = "nemesis-scar";
  scar.textContent = row.scar;
  item.append(head, where, scar);
  return item;
}

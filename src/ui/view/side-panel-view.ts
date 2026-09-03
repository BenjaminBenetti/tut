import type { GameState } from "../../save/model/game-state";

// ===========================================
// SidePanelView
// ===========================================

/**
 * The overworld's right-hand panel. In this slice it shows the situation
 * report: the selected city (filled in by the map picking wiring through
 * `#selected-city`), the campaign seed and the camera hint. The city
 * detail and mission list issues (#75, #76) extend it.
 */
export class SidePanelView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private seed: HTMLElement | undefined;
  private note: HTMLElement | undefined;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("aside");
    panel.id = "side-panel";
    panel.className = "tut-panel tut-overworld__side";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Situation";

    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    const [cityTerm, cityValue] = this.createField(
      doc,
      "Selected city",
      "selected-city",
    );
    cityValue.id = "selected-city";
    const [seedTerm, seedValue] = this.createField(doc, "Seed", "seed");
    grid.append(cityTerm, cityValue, seedTerm, seedValue);

    const note = doc.createElement("p");
    note.className = "tut-dim";
    note.dataset.role = "no-campaign";
    note.textContent = "No active campaign.";
    note.hidden = true;

    const hint = doc.createElement("p");
    hint.className = "tut-dim";
    hint.textContent =
      "Click a city · Q / E rotate · wheel zoom · WASD or arrows pan.";

    panel.append(title, grid, note, hint);
    parent.appendChild(panel);

    this.root = panel;
    this.seed = seedValue;
    this.note = note;
  }

  /** Refreshes the campaign facts; shows the no-campaign note when there is none. */
  update(state: GameState | undefined): void {
    if (!this.seed || !this.note) {
      return;
    }
    this.seed.textContent = state ? String(state.meta.seed) : "—";
    this.note.hidden = state !== undefined;
  }

  /** Removes the panel. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.seed = undefined;
    this.note = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** One label/value pair; the value carries `data-field` for tests. */
  private createField(
    doc: Document,
    label: string,
    field: string,
  ): [HTMLElement, HTMLElement] {
    const term = doc.createElement("dt");
    term.className = "tut-label";
    term.textContent = label;
    const value = doc.createElement("dd");
    value.className = "tut-mono";
    value.dataset.field = field;
    value.textContent = "—";
    return [term, value];
  }
}

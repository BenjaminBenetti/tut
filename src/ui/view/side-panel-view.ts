import type { GameState } from "../../save/model/game-state";

// ===========================================
// SidePanelView
// ===========================================

/**
 * The overworld's right-hand panel: the situation report (seed and the
 * camera hint) followed by whatever sections the screen mounts into
 * `container` (the city card and deployables from #75, the mission list
 * from #76).
 */
export class SidePanelView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private seed: HTMLElement | undefined;
  private note: HTMLElement | undefined;
  private sections: HTMLElement | undefined;

  // ===========================================
  // Accessors
  // ===========================================

  /** Where the screen mounts further sections; undefined before `mount`. */
  get container(): HTMLElement | undefined {
    return this.sections;
  }

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
    const [seedTerm, seedValue] = this.createField(doc, "Seed", "seed");
    grid.append(seedTerm, seedValue);

    const note = doc.createElement("p");
    note.className = "tut-dim";
    note.dataset.role = "no-campaign";
    note.textContent = "No active campaign.";
    note.hidden = true;

    const hint = doc.createElement("p");
    hint.className = "tut-dim";
    hint.textContent = "Click a city · wheel zoom · WASD or arrows pan.";

    const sections = doc.createElement("div");
    sections.className = "tut-stack";
    sections.dataset.role = "panel-sections";

    panel.append(title, grid, note, hint, sections);
    parent.appendChild(panel);

    this.root = panel;
    this.seed = seedValue;
    this.note = note;
    this.sections = sections;
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
    this.sections = undefined;
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

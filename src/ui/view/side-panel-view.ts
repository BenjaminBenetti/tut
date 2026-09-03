import { findCity } from "../../overworld/service/earth-map-query-service";
import type { GameState } from "../../save/model/game-state";
import type { OverworldSelectionSnapshot } from "../model/overworld-selection";

// ===========================================
// SidePanelView
// ===========================================

/**
 * The overworld's right-hand panel: the situation report (selected city
 * and campaign seed) followed by whatever sections the screen mounts
 * into `sections` (the mission list and briefing). The selected city is
 * rendered from the UI selection state, so the map and the mission list
 * both drive the same label.
 */
export class SidePanelView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private host: HTMLElement | undefined;
  private city: HTMLElement | undefined;
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

    const host = doc.createElement("div");
    host.className = "tut-stack";
    host.dataset.role = "side-panel-sections";

    panel.append(title, grid, note, hint, host);
    parent.appendChild(panel);

    this.root = panel;
    this.host = host;
    this.city = cityValue;
    this.seed = seedValue;
    this.note = note;
  }

  /** Where the screen mounts further sections, in order. Only valid while mounted. */
  get sections(): HTMLElement {
    if (!this.host) {
      throw new Error("SidePanelView is not mounted");
    }
    return this.host;
  }

  /** Refreshes the campaign facts and the selected city's name. */
  update(
    state: GameState | undefined,
    selection: OverworldSelectionSnapshot,
  ): void {
    if (!this.seed || !this.note || !this.city) {
      return;
    }
    this.seed.textContent = state ? String(state.meta.seed) : "—";
    this.note.hidden = state !== undefined;
    const city =
      state && selection.cityId !== undefined
        ? findCity(state.overworld.map, selection.cityId)
        : undefined;
    const name = city?.name ?? "—";
    if (this.city.textContent !== name) {
      this.city.textContent = name;
    }
  }

  /** Removes the panel. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.host = undefined;
    this.city = undefined;
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

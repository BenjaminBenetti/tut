import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";

// ===========================================
// Types
// ===========================================

/** What the placeholder overworld needs from the app. */
export interface OverworldScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
}

// ===========================================
// OverworldScreen
// ===========================================

/**
 * Placeholder overworld: shows the campaign's seed and start time from
 * the session over the placeholder tactical scene, with a way back to
 * the menu. The real overworld screen (#73 onward) replaces the body of
 * `mount`; the id, deps and lifecycle stay.
 */
export class OverworldScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "overworld";
  private readonly deps: OverworldScreenDeps;
  private panel: HTMLElement | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router and the session whose state is displayed. */
  constructor(deps: OverworldScreenDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the campaign panel from the session state. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;

    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-overworld";
    panel.dataset.screen = this.id;

    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = "Overworld · placeholder";

    const title = doc.createElement("h1");
    title.textContent = "Campaign";

    panel.append(kicker, title, this.createSummary(doc));

    const hint = doc.createElement("p");
    hint.className = "tut-dim";
    hint.textContent =
      "Q / E rotate · wheel zoom · WASD or arrows pan the placeholder scene.";

    const back = doc.createElement("button");
    back.type = "button";
    back.className = "tut-btn";
    back.dataset.action = "back-to-menu";
    back.textContent = "Back to menu";

    panel.append(hint, back);
    root.appendChild(panel);

    const handler = (): void => {
      this.deps.router.navigate("main-menu");
    };
    back.addEventListener("click", handler);
    this.disposers.push(() => {
      back.removeEventListener("click", handler);
    });

    this.panel = panel;
  }

  /** Removes the panel and its listener. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.panel?.remove();
    this.panel = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Seed and start time as a label/value grid, or a note when no campaign is active. */
  private createSummary(doc: Document): HTMLElement {
    const state = this.deps.session.state;
    if (!state) {
      const note = doc.createElement("p");
      note.className = "tut-dim";
      note.dataset.role = "no-campaign";
      note.textContent = "No active campaign.";
      return note;
    }

    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    grid.append(
      ...this.createField(doc, "Seed", "seed", String(state.meta.seed)),
      ...this.createField(doc, "Started", "created-at", state.meta.createdAt),
    );
    return grid;
  }

  /** One label/value pair; the value carries `data-field` for tests. */
  private createField(
    doc: Document,
    label: string,
    field: string,
    value: string,
  ): [HTMLElement, HTMLElement] {
    const term = doc.createElement("dt");
    term.className = "tut-label";
    term.textContent = label;
    const detail = doc.createElement("dd");
    detail.className = "tut-mono";
    detail.dataset.field = field;
    detail.textContent = value;
    return [term, detail];
  }
}

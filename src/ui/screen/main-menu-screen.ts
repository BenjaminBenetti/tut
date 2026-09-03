import { AUTOSAVE_SLOT_ID } from "../../save/data/save-slots";
import type { GameState } from "../../save/model/game-state";
import type { SaveClock } from "../../save/model/save-clock";
import type { GameSaveService } from "../../save/service/game-save-service";
import type { NewGameOptions } from "../../save/service/game-state-factory";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";

// ===========================================
// Types
// ===========================================

/** Everything the main menu needs, injected by the app's composition root. */
export interface MainMenuScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  readonly saves: GameSaveService;
  /** Builds a full campaign; the app binds `createNewGame` to the shipped content. */
  readonly createCampaign: (options: NewGameOptions) => GameState;
  /** Source of the seed for a new campaign; the app passes core's `randomSeed`. */
  readonly newSeed: () => number;
  /** Timestamp source for `createdAt`; the app passes the wall clock. */
  readonly clock: SaveClock;
}

// ===========================================
// MainMenuScreen
// ===========================================

/**
 * Title screen. "New game" creates a campaign from a fresh seed, writes
 * it to the autosave slot and opens the overworld; "Continue" reloads the
 * autosave and is disabled when there is none.
 *
 * ```
 *   [New game] ──▶ createCampaign ──▶ session.start ──▶ saves.saveGame(autosave) ──▶ overworld
 *   [Continue] ──▶ saves.loadGame(autosave) ──▶ session.start ───────────────────────▶ overworld
 * ```
 */
export class MainMenuScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "main-menu";
  private readonly deps: MainMenuScreenDeps;
  private panel: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session, save service, campaign factory and the seed / clock sources. */
  constructor(deps: MainMenuScreenDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the menu panel and wires its buttons. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;

    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-menu";
    panel.dataset.screen = this.id;

    const kicker = doc.createElement("div");
    kicker.className = "tut-panel__title";
    kicker.textContent = "Terra Defence Force · Command";

    const title = doc.createElement("h1");
    title.textContent = "Terra Under Threat";

    const tagline = doc.createElement("p");
    tagline.className = "tut-dim";
    tagline.textContent = "The bugs are here. Hold the line.";

    const actions = doc.createElement("div");
    actions.className = "tut-stack";

    const newGame = this.createButton(doc, "new-game", "New game", true);
    const cont = this.createButton(doc, "continue", "Continue", false);
    cont.disabled = !this.hasAutosave();
    actions.append(newGame, cont);

    const status = doc.createElement("p");
    status.className = "tut-menu__status tut-dim";
    status.dataset.role = "status";
    status.hidden = true;

    panel.append(kicker, title, tagline, actions, status);
    root.appendChild(panel);

    this.listen(newGame, () => {
      this.startNewGame();
    });
    this.listen(cont, () => {
      this.continueGame();
    });

    this.panel = panel;
    this.status = status;
  }

  /** Removes the panel and every listener added in `mount`. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.panel?.remove();
    this.panel = undefined;
    this.status = undefined;
  }

  // ===========================================
  // Actions
  // ===========================================

  /**
   * Creates a campaign, starts the session, autosaves and navigates. A
   * failed autosave is reported on the panel but does not block play.
   */
  private startNewGame(): void {
    const state = this.deps.createCampaign({
      seed: this.deps.newSeed(),
      createdAt: this.deps.clock.now(),
    });
    this.deps.session.start(state);

    const saved = this.deps.saves.saveGame(AUTOSAVE_SLOT_ID, state);
    if (!saved.ok) {
      this.showStatus(`Autosave failed: ${saved.error.message}`);
    }
    this.deps.router.navigate("overworld");
  }

  /** Loads the autosave into the session and navigates; a failed load stays on the menu with a message. */
  private continueGame(): void {
    const loaded = this.deps.saves.loadGame(AUTOSAVE_SLOT_ID);
    if (!loaded.ok) {
      this.showStatus(`Could not load autosave: ${loaded.error.message}`);
      return;
    }
    this.deps.session.start(loaded.value);
    this.deps.router.navigate("overworld");
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** True when the autosave slot holds a readable save. */
  private hasAutosave(): boolean {
    return this.deps.saves
      .listSlots()
      .some((slot) => slot.id === AUTOSAVE_SLOT_ID);
  }

  /** Builds a themed button carrying its `data-action`. */
  private createButton(
    doc: Document,
    action: string,
    label: string,
    primary: boolean,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = primary ? "tut-btn tut-btn--primary" : "tut-btn";
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }

  /** Attaches a click handler and remembers how to remove it. */
  private listen(target: HTMLElement, handler: () => void): void {
    target.addEventListener("click", handler);
    this.disposers.push(() => {
      target.removeEventListener("click", handler);
    });
  }

  /** Shows a one-line message under the buttons. */
  private showStatus(message: string): void {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    this.status.hidden = false;
  }
}

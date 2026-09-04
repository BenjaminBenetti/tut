import { AUTOSAVE_SLOT_ID } from "../../save/data/save-slots";
import type { GameState } from "../../save/model/game-state";
import type { SaveClock } from "../../save/model/save-clock";
import type { SaveError } from "../../save/model/save-error";
import type { GameSaveService } from "../../save/service/game-save-service";
import type { NewGameOptions } from "../../save/service/game-state-factory";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { resolveSeed } from "../service/seed-input";

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
  /** Default seed offered in the seed box; the app passes core's `randomSeed`. */
  readonly newSeed: () => number;
  /** Timestamp source for `createdAt`; the app passes the wall clock. */
  readonly clock: SaveClock;
}

// ===========================================
// MainMenuScreen
// ===========================================

/**
 * Title screen. New game builds a campaign from the seed box, Continue
 * reloads the autosave, Export dumps the autosave as JSON into the text
 * box and Import starts a campaign from pasted JSON. Starting a session
 * is what persists it: the app's autosave observes every store the
 * session creates, so the menu never writes a save itself.
 *
 * ```
 *   [New game] ──▶ createCampaign(seed) ──▶ session.start ──▶ overworld
 *   [Continue] ──▶ saves.loadGame(autosave) ──▶ session.start ──▶ overworld
 *                                                        └── activeMission? ──▶ tactical
 *   [Export]   ──▶ saves.loadGame(autosave) ──▶ saves.exportGame ──▶ text box
 *   [Import]   ──▶ saves.importGame(text box) ──▶ session.start ──▶ overworld
 * ```
 */
export class MainMenuScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "main-menu";
  private readonly deps: MainMenuScreenDeps;
  private panel: HTMLElement | undefined;
  private seedInput: HTMLInputElement | undefined;
  private saveText: HTMLTextAreaElement | undefined;
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

  /** Builds the menu panel and wires its controls. */
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

    const autosave = this.probeAutosave();
    const hasSave = autosave.usable;
    const seedRow = this.createSeedRow(doc);
    const newGame = this.createButton(doc, "new-game", "New game", true);
    const cont = this.createButton(doc, "continue", "Continue", false);
    cont.disabled = !hasSave;

    const actions = doc.createElement("div");
    actions.className = "tut-stack";
    actions.append(seedRow, newGame, cont);

    const io = this.createSaveIo(doc, hasSave);

    const status = doc.createElement("p");
    status.className = "tut-menu__status tut-dim";
    status.dataset.role = "status";
    status.hidden = true;

    panel.append(kicker, title, tagline, actions, io.section, status);
    root.appendChild(panel);

    this.listen(newGame, () => {
      this.startNewGame();
    });
    this.listen(cont, () => {
      this.continueGame();
    });
    this.listen(io.exportButton, () => {
      this.exportSave();
    });
    this.listen(io.importButton, () => {
      this.importSave();
    });

    this.panel = panel;
    this.status = status;
    if (autosave.problem) {
      this.showStatus(describeUnreadableAutosave(autosave.problem));
    }
  }

  /** Removes the panel and every listener added in `mount`. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.panel?.remove();
    this.panel = undefined;
    this.seedInput = undefined;
    this.saveText = undefined;
    this.status = undefined;
  }

  // ===========================================
  // Actions
  // ===========================================

  /** Builds a campaign from the seed box, starts the session and opens the overworld. */
  private startNewGame(): void {
    const seed = resolveSeed(this.seedInput?.value ?? "", this.deps.newSeed);
    const state = this.deps.createCampaign({
      seed,
      createdAt: this.deps.clock.now(),
    });
    this.deps.session.start(state);
    this.deps.router.navigate("overworld");
  }

  /**
   * Loads the autosave into a new session and resumes where the player
   * left off: the tactical screen when a mission was in progress (#341),
   * the overworld otherwise. A failed load stays here with a message.
   */
  private continueGame(): void {
    const loaded = this.deps.saves.loadGame(AUTOSAVE_SLOT_ID);
    if (!loaded.ok) {
      this.showStatus(`Could not load autosave: ${loaded.error.message}`);
      return;
    }
    this.deps.session.start(loaded.value);
    this.deps.router.navigate(
      loaded.value.activeMission === undefined ? "overworld" : "tactical",
    );
  }

  /** Dumps the autosave as a self-describing JSON document into the text box. */
  private exportSave(): void {
    const loaded = this.deps.saves.loadGame(AUTOSAVE_SLOT_ID);
    if (!loaded.ok) {
      this.showStatus(`Nothing to export: ${loaded.error.message}`);
      return;
    }
    if (this.saveText) {
      this.saveText.value = this.deps.saves.exportGame(loaded.value);
    }
    this.showStatus(
      "Autosave exported to the text box. Copy it somewhere safe.",
    );
  }

  /** Starts a campaign from the JSON in the text box; a rejected document stays here with the reason. */
  private importSave(): void {
    const text = this.saveText?.value.trim() ?? "";
    if (text.length === 0) {
      this.showStatus("Paste an exported save into the text box first.");
      return;
    }
    const imported = this.deps.saves.importGame(text);
    if (!imported.ok) {
      this.showStatus(`Could not import save: ${imported.error.message}`);
      return;
    }
    this.deps.session.start(imported.value);
    this.deps.router.navigate("overworld");
  }

  // ===========================================
  // Helpers
  // ===========================================

  /**
   * Whether the autosave slot holds a loadable campaign. An absent slot
   * is simply no autosave; anything else that fails to load (corrupt
   * JSON, a schema this build cannot read, a state that is not a
   * campaign) is reported so Continue never goes quiet on a save the
   * player can see in storage (#219).
   */
  private probeAutosave(): { usable: boolean; problem?: SaveError } {
    const loaded = this.deps.saves.loadGame(AUTOSAVE_SLOT_ID);
    if (loaded.ok) {
      return { usable: true };
    }
    return loaded.error.kind === "missing"
      ? { usable: false }
      : { usable: false, problem: loaded.error };
  }

  /** Label plus the seed text box, pre-filled with a fresh random seed. */
  private createSeedRow(doc: Document): HTMLElement {
    const row = doc.createElement("label");
    row.className = "tut-menu__seed";

    const label = doc.createElement("span");
    label.className = "tut-label";
    label.textContent = "Seed";

    const input = doc.createElement("input");
    input.type = "text";
    input.className = "tut-input";
    input.dataset.field = "seed";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.value = String(this.deps.newSeed());

    row.append(label, input);
    this.seedInput = input;
    return row;
  }

  /** The Export / Import buttons and the shared JSON text box. */
  private createSaveIo(
    doc: Document,
    hasSave: boolean,
  ): {
    section: HTMLElement;
    exportButton: HTMLButtonElement;
    importButton: HTMLButtonElement;
  } {
    const section = doc.createElement("div");
    section.className = "tut-menu__io";

    const heading = doc.createElement("span");
    heading.className = "tut-label";
    heading.textContent = "Save file";

    const textarea = doc.createElement("textarea");
    textarea.className = "tut-input tut-textarea";
    textarea.dataset.field = "save-json";
    textarea.rows = 4;
    textarea.spellcheck = false;
    textarea.placeholder =
      "Exported save JSON appears here; paste one to import.";

    const buttons = doc.createElement("div");
    buttons.className = "tut-row";
    const exportButton = this.createButton(doc, "export", "Export", false);
    exportButton.disabled = !hasSave;
    const importButton = this.createButton(doc, "import", "Import", false);
    buttons.append(exportButton, importButton);

    section.append(heading, textarea, buttons);
    this.saveText = textarea;
    return { section, exportButton, importButton };
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

  /** Shows a one-line message under the controls. */
  private showStatus(message: string): void {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    this.status.hidden = false;
  }
}

// ===========================================
// Helpers
// ===========================================

/** One sentence telling the player why the autosave cannot be continued, and what to do. */
export function describeUnreadableAutosave(error: SaveError): string {
  const lead =
    error.kind === "unsupported-version"
      ? "The autosave was written by a newer version of the game and cannot be read by this build"
      : "An autosave exists but cannot be read";
  return `${lead} (${error.kind}: ${error.message}). Import a copy you exported earlier, or start a new game.`;
}

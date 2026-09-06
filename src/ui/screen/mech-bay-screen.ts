import type { Unsubscribe } from "../../core/model/event-bus";
import type { Result } from "../../core/model/result";
import { buildMech } from "../../overworld/model/build-mech-command";
import { deleteLoadout } from "../../overworld/model/delete-loadout-command";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { saveLoadout } from "../../overworld/model/save-loadout-command";
import type { LoadoutError } from "../../roster/model/loadout-error";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { MechRatingTuning } from "../../roster/model/mech-rating-tuning";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { UpgradeTuning } from "../../roster/model/upgrade-tuning";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import type { GameSession } from "../model/game-session";
import type { MechPreviewHost } from "../model/mech-preview-host";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { formatCredits } from "../service/format";
import { LoadoutEditorView } from "../view/loadout-editor-view";
import { MechPreviewView } from "../view/mech-preview-view";
import { SavedLoadoutsView } from "../view/saved-loadouts-view";
import { StatSheetView } from "../view/stat-sheet-view";

// ===========================================
// Types
// ===========================================

/** What the mech bay needs from the app. */
export interface MechBayScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** The parts the pickers offer and the validator resolves against. */
  readonly parts: PartCatalogue;
  /** Combat-rating weights for the sheet. */
  readonly rating: MechRatingTuning;
  /** Upgrade multipliers for any levels the draft records. */
  readonly upgrades: UpgradeTuning;
  /**
   * Draws the draft as an assembled mech (#694). Optional: with none,
   * the preview panel shows its empty note and the bay is unchanged,
   * which is what the jsdom specs run against.
   */
  readonly preview?: MechPreviewHost;
}

/** Name a fresh draft gets when the campaign has no saved template to start from. */
const NEW_LOADOUT_NAME = "New loadout";

/** Name a built mech gets when the field is left blank. */
const DEFAULT_MECH_NAME = "Mech";

// ===========================================
// MechBayScreen
// ===========================================

/**
 * The mech bay (GDD §5.8): choose a chassis, fit parts, watch validation
 * and the stat sheet follow every change, then save the draft under its
 * name or build a mech from it. The draft starts from the campaign's
 * first saved template, or from the first catalogue part in each slot
 * when there is none. Save, Load, Delete and Build dispatch the #63
 * roster commands through the campaign store; a rejection lands in the
 * header's status line.
 *
 * ```
 *   ┌ #mech-bay-bar  MECH BAY  ¢5,000 ── status ── [Save] [mech name][Build ¢3,250] [Roster] ┐
 *   ├───────────────────────────────┬─────────────────────────────────────────────────────────┤
 *   │ #loadout-editor               │ #stat-sheet                                             │
 *   │ pickers + inline errors       │ values / error list                                     │
 *   │ #saved-loadouts               │                                                         │
 *   └───────────────────────────────┴─────────────────────────────────────────────────────────┘
 *
 *   editor.onChange(draft) ──► validateLoadout(draft) ──► sheet, editor errors, Build button
 *   [Save]  ──► store.dispatch(saveLoadout(draft))
 *   [Build] ──► store.dispatch(saveLoadout(draft)) then store.dispatch(buildMech(draft.name, mechName))
 *   store.subscribe ──► credits, saved list, Build button
 * ```
 *
 * Build saves first because `BuildMech` builds from a saved template by
 * name; the player's draft therefore always ends up in the saved list
 * under the name they gave it.
 */
export class MechBayScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "mech-bay";
  private readonly deps: MechBayScreenDeps;
  private readonly editor: LoadoutEditorView;
  private readonly sheet = new StatSheetView();
  private readonly preview = new MechPreviewView();
  private readonly saved: SavedLoadoutsView;
  private root: HTMLElement | undefined;
  private credits: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private saveButton: HTMLButtonElement | undefined;
  private buildButton: HTMLButtonElement | undefined;
  private mechName: HTMLInputElement | undefined;
  private draft: MechLoadout | undefined;
  private result: Result<MechStatSheet, LoadoutError[]> | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session and the content the editor and validator read. */
  constructor(deps: MechBayScreenDeps) {
    this.deps = deps;
    this.editor = new LoadoutEditorView(
      {
        onChange: (loadout) => {
          this.validate(loadout);
        },
      },
      deps.parts,
    );
    this.saved = new SavedLoadoutsView({
      onLoad: (loadout) => {
        this.editor.setLoadout(loadout);
        this.validate(loadout);
        this.showStatus("");
      },
      onDelete: (name) => {
        this.dispatch(deleteLoadout(name));
      },
    });
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the layout, seeds the draft and subscribes to the store. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-mech-bay";
    layout.dataset.screen = this.id;
    layout.appendChild(this.createBar(doc));
    const body = doc.createElement("div");
    body.className = "tut-mech-bay__body";
    const left = doc.createElement("div");
    left.className = "tut-stack";
    this.editor.mount(left);
    this.saved.mount(left);
    body.appendChild(left);
    // The sheet used to be the whole right column and ended 470 px shy
    // of the bottom; the picture of the mech goes in that room (#694).
    const right = doc.createElement("div");
    right.className = "tut-stack";
    this.sheet.mount(right);
    this.preview.mount(right);
    body.appendChild(right);
    layout.appendChild(body);
    root.appendChild(layout);
    this.root = layout;

    const store = this.deps.session.store;
    const state = store?.getState();
    this.render(state);
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state);
    });

    const viewport = this.preview.viewport();
    if (viewport && this.deps.preview) {
      this.deps.preview.attach(viewport);
      this.preview.markAttached();
    }

    const draft = this.initialDraft(state);
    this.editor.setLoadout(draft);
    this.validate(draft);
  }

  /** Unsubscribes, unmounts the views and removes the layout. */
  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.deps.preview?.release();
    this.editor.unmount();
    this.saved.unmount();
    this.sheet.unmount();
    this.preview.unmount();
    this.root?.remove();
    this.root = undefined;
    this.credits = undefined;
    this.status = undefined;
    this.saveButton = undefined;
    this.buildButton = undefined;
    this.mechName = undefined;
  }

  // ===========================================
  // Validation
  // ===========================================

  /** Runs the roster's validator over the draft and pushes the outcome to the views and buttons. */
  private validate(loadout: MechLoadout): void {
    this.draft = loadout;
    this.result = validateLoadout(
      loadout,
      this.deps.parts,
      this.deps.rating,
      this.deps.upgrades,
    );
    this.sheet.update(this.result);
    // Drawn from the draft, not from the sheet: an over-weight mech is
    // still the mech the player is looking at, and hiding it on the
    // frame it goes invalid is the one moment they need to see it.
    void this.deps.preview?.show(loadout);
    this.editor.setErrors(this.result.ok ? [] : this.result.error);
    this.refreshButtons(this.deps.session.state);
  }

  /** The first saved template, or the first catalogue part per slot with no utilities. */
  private initialDraft(state: GameState | undefined): MechLoadout {
    const saved = state?.roster.savedLoadouts[0];
    if (saved) {
      return saved;
    }
    const first = (
      slot: Parameters<PartCatalogue["partsForSlot"]>[0],
    ): string => this.deps.parts.partsForSlot(slot)[0]?.id ?? "";
    return {
      name: NEW_LOADOUT_NAME,
      chassisId: first("chassis"),
      legsId: first("legs"),
      armsId: first("arms"),
      armWeaponId: first("arm-weapon"),
      backWeaponId: first("back-weapon"),
      utilityIds: [],
    };
  }

  // ===========================================
  // Actions
  // ===========================================

  /** Saves the draft under the name in the editor. */
  private save(): void {
    if (this.draft) {
      this.dispatch(saveLoadout(this.draft));
    }
  }

  /** Saves the draft, then builds a mech from it under the given name. */
  private build(): void {
    if (!this.draft) {
      return;
    }
    const typed = this.mechName?.value.trim() ?? "";
    const mechName = typed === "" ? DEFAULT_MECH_NAME : typed;
    if (!this.dispatch(saveLoadout(this.draft))) {
      return;
    }
    if (this.dispatch(buildMech(this.draft.name, mechName)) && this.mechName) {
      this.mechName.value = "";
      this.showStatus(`Built ${mechName}.`);
    }
  }

  /** Runs a command through the store; a rejection lands in the status line. Returns success. */
  private dispatch(command: OverworldCommand): boolean {
    const store = this.deps.session.store;
    if (!store) {
      this.showStatus("No active campaign.");
      return false;
    }
    const result = store.dispatch(command);
    this.showStatus(result.ok ? "" : result.error.message);
    return result.ok;
  }

  /** Shows a one-line message in the bar, or hides the line when empty. */
  private showStatus(message: string): void {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    this.status.hidden = message === "";
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** Refreshes everything that follows the campaign state. */
  private render(state: GameState | undefined): void {
    if (this.credits) {
      this.credits.textContent = state
        ? formatCredits(state.economy.credits)
        : "—";
    }
    this.saved.update(state?.roster.savedLoadouts ?? []);
    this.refreshButtons(state);
  }

  /**
   * Save needs a campaign and a valid draft; Build additionally needs the
   * treasury to cover the sheet's total cost, which the button shows.
   */
  private refreshButtons(state: GameState | undefined): void {
    if (!this.saveButton || !this.buildButton) {
      return;
    }
    const valid = this.result?.ok === true;
    const hasCampaign = state !== undefined;
    this.saveButton.disabled = !hasCampaign || !valid;
    if (this.result?.ok) {
      const cost = this.result.value.totalCost;
      const affordable = hasCampaign && state.economy.credits >= cost;
      this.buildButton.textContent = `Build ${formatCredits(cost)}`;
      this.buildButton.disabled = !affordable;
      this.buildButton.title =
        hasCampaign && !affordable ? "Not enough credits" : "";
    } else {
      this.buildButton.textContent = "Build";
      this.buildButton.disabled = true;
      this.buildButton.title = "Fix the loadout first";
    }
  }

  /** The header: title, credits, status, Save, mech name and Build, and the way back. */
  private createBar(doc: Document): HTMLElement {
    const bar = doc.createElement("header");
    bar.id = "mech-bay-bar";
    bar.className = "tut-topbar tut-mech-bay__bar";
    const title = doc.createElement("span");
    title.className = "tut-label";
    title.textContent = "Mech bay";
    const credits = doc.createElement("span");
    credits.className = "tut-data";
    credits.dataset.field = "credits";
    credits.textContent = "—";
    const spacer = doc.createElement("span");
    spacer.className = "tut-topbar__spacer";
    const status = doc.createElement("span");
    status.className = "tut-topbar__status tut-dim";
    status.dataset.role = "status";
    status.hidden = true;

    const save = this.createButton(doc, "save-loadout", "Save loadout", false);
    this.listen(save, () => {
      this.save();
    });
    const mechName = doc.createElement("input");
    mechName.type = "text";
    mechName.className = "tut-input";
    mechName.placeholder = "Mech name";
    mechName.dataset.field = "mech-name";
    mechName.maxLength = 24;
    const build = this.createButton(doc, "build-mech", "Build", true);
    build.disabled = true;
    this.listen(build, () => {
      this.build();
    });
    const roster = this.createButton(doc, "roster", "Roster", false);
    this.listen(roster, () => {
      this.deps.router.navigate("roster");
    });

    bar.append(title, credits, spacer, status, save, mechName, build, roster);
    this.credits = credits;
    this.status = status;
    this.saveButton = save;
    this.buildButton = build;
    this.mechName = mechName;
    return bar;
  }

  /** A themed button carrying its `data-action`. */
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
}

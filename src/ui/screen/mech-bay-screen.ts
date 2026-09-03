import type { Unsubscribe } from "../../core/model/event-bus";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { MechRatingTuning } from "../../roster/model/mech-rating-tuning";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { UpgradeTuning } from "../../roster/model/upgrade-tuning";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { formatCredits } from "../service/format";
import { LoadoutEditorView } from "../view/loadout-editor-view";
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
}

/** Name a fresh draft gets when the campaign has no saved template to start from. */
const NEW_LOADOUT_NAME = "New loadout";

// ===========================================
// MechBayScreen
// ===========================================

/**
 * The mech bay's editor half (GDD §5.8): choose a chassis, fit parts,
 * and watch validation and the stat sheet follow every change. The
 * draft starts from the campaign's first saved template, or from the
 * first catalogue part in each slot when there is none. Nothing is
 * purchased or saved here; that is the next issue (#81).
 *
 * ```
 *   ┌ #mech-bay-bar  MECH BAY  ¢5,000 ─────────── [Roster] ┐
 *   ├───────────────────────────────┬────────────────────────┤
 *   │ #loadout-editor               │ #stat-sheet            │
 *   │ pickers + inline errors       │ values / error list    │
 *   └───────────────────────────────┴────────────────────────┘
 *
 *   editor.onChange(draft) ──► validateLoadout(draft, parts, rating, upgrades)
 *                                  ├─ ok  ──► sheet.update(ok),  editor.setErrors([])
 *                                  └─ err ──► sheet.update(err), editor.setErrors(errors)
 * ```
 */
export class MechBayScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "mech-bay";
  private readonly deps: MechBayScreenDeps;
  private readonly editor: LoadoutEditorView;
  private readonly sheet = new StatSheetView();
  private root: HTMLElement | undefined;
  private credits: HTMLElement | undefined;
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
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the layout, seeds the draft and subscribes to the store for the credits readout. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-mech-bay";
    layout.dataset.screen = this.id;
    layout.appendChild(this.createBar(doc));
    const body = doc.createElement("div");
    body.className = "tut-mech-bay__body";
    this.editor.mount(body);
    this.sheet.mount(body);
    layout.appendChild(body);
    root.appendChild(layout);
    this.root = layout;

    const store = this.deps.session.store;
    const state = store?.getState();
    this.renderCredits(state);
    this.unsubscribe = store?.subscribe((change) => {
      this.renderCredits(change.state);
    });

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
    this.editor.unmount();
    this.sheet.unmount();
    this.root?.remove();
    this.root = undefined;
    this.credits = undefined;
  }

  // ===========================================
  // Validation
  // ===========================================

  /** Runs the roster's validator over the draft and pushes the outcome to both views. */
  private validate(loadout: MechLoadout): void {
    const result = validateLoadout(
      loadout,
      this.deps.parts,
      this.deps.rating,
      this.deps.upgrades,
    );
    this.sheet.update(result);
    this.editor.setErrors(result.ok ? [] : result.error);
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
  // Rendering
  // ===========================================

  /** Refreshes the credits readout so the player can weigh the total cost. */
  private renderCredits(state: GameState | undefined): void {
    if (this.credits) {
      this.credits.textContent = state
        ? formatCredits(state.economy.credits)
        : "—";
    }
  }

  /** The header: title, credits and the way back to the roster. */
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
    const roster = doc.createElement("button");
    roster.type = "button";
    roster.className = "tut-btn";
    roster.dataset.action = "roster";
    roster.textContent = "Roster";
    const onRoster = (): void => {
      this.deps.router.navigate("roster");
    };
    roster.addEventListener("click", onRoster);
    this.disposers.push(() => {
      roster.removeEventListener("click", onRoster);
    });
    bar.append(title, credits, spacer, roster);
    this.credits = credits;
    return bar;
  }
}

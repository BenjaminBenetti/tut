import type { Unsubscribe } from "../../core/model/event-bus";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { buildMech } from "../../overworld/model/build-mech-command";
import { deleteLoadout } from "../../overworld/model/delete-loadout-command";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { saveLoadout } from "../../overworld/model/save-loadout-command";
import type { LoadoutError } from "../../roster/model/loadout-error";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { MechPart } from "../../roster/model/mech-part";
import type { MechRatingTuning } from "../../roster/model/mech-rating-tuning";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { PartAvailability } from "../../roster/model/part-availability";
import { ALL_PARTS_AVAILABLE } from "../../roster/model/part-availability";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { UpgradeTuning } from "../../roster/model/upgrade-tuning";
import {
  fitPart,
  removeUtility,
} from "../../roster/service/loadout-fit-service";
import type { LoadoutDescription } from "../../roster/service/loadout-validation-service";
import { describeLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import { partIdsOf } from "../../tech/model/tech-effect";
import { createPartAvailability } from "../../tech/service/part-availability-service";
import type { UnitTuning } from "../../tactical/model/unit-tuning";
import type { GameSession } from "../model/game-session";
import type { MechPreviewHost } from "../model/mech-preview-host";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { formatCredits } from "../service/format";
import { sheetPreview } from "../service/sheet-preview";
import { MechStageView } from "../view/mech-stage-view";
import { PartPaletteView } from "../view/part-palette-view";
import { SavedLoadoutsView } from "../view/saved-loadouts-view";
import { StatSheetView } from "../view/stat-sheet-view";

// ===========================================
// Types
// ===========================================

/** What the mech bay needs from the app. */
export interface MechBayScreenDeps {
  readonly blueprints?: readonly MechLoadout[];
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** The parts the palette offers and the validator resolves against. */
  readonly parts: PartCatalogue;
  /** The tree that decides which parts above tier 1 are purchasable (#1171). */
  readonly tech: TechCatalogue;
  /** Combat-rating weights for the sheet. */
  readonly rating: MechRatingTuning;
  /**
   * Turns a sheet into the field numbers the sheet panel prints (#1132):
   * the same tuning the mission's unit factory uses, so the bay and the
   * field agree.
   */
  readonly unitTuning: UnitTuning;
  /** Upgrade multipliers for any levels the draft records. */
  readonly upgrades: UpgradeTuning;
  /**
   * Draws the draft as an assembled mech (#694). Optional: with none,
   * the stage shows its empty note and the bay is unchanged, which is
   * what the jsdom specs run against.
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
 * The mech bay (GDD §5.8), built around the mech (#1145): the assembled
 * draft stands in the middle with a badge on every fitted part, the
 * palette on the left lists every catalogue part to drag onto it, the
 * stat sheet on the right follows every change and previews what a
 * rested-on part would do, and the saved templates live in a popover
 * off the bottom bar. Save, Load, Delete and Build dispatch the #63
 * roster commands through the campaign store; a rejection lands in the
 * header's status line.
 *
 * ```
 *   ┌ #mech-bay-bar  MECH BAY  ¢5,000 ── status ── [mech name][Build ¢2,850] [Tech tree] [Roster] ┐
 *   ├──────────────┬────────────────────────────────────┬─────────────────────────────┤
 *   │ #part-palette│ #mech-stage                        │ #stat-sheet                 │
 *   │ search       │        ┌ BACK WEAPON ┐             │ Combat  HP 70  +6           │
 *   │ slot chips   │        │ Missile Pod │             │         Armor 6             │
 *   │ ┌──┐ Railgun │  ┌ARMS┐   [ mech ]  ┌ARM WEAPON┐  │ Build   Weight 60  +15      │
 *   │ └──┘ T2 ¢…   │  └────┘             └──────────┘  │ ⚠ would be overweight       │
 *   │ …            │  [UTILITY 1 Radiator ×][UTILITY 2] │                             │
 *   ├──────────────┴────────────────────────────────────┴─────────────────────────────┤
 *   │ [▴ Loadouts · Skirmisher]                                                       │
 *   └─────────────────────────────────────────────────────────────────────────────────┘
 *
 *   palette.onHover(part)  ──► fitPart(draft, part) ──► describeLoadout ──► sheet.preview(deltas)
 *   palette drag ──► stage drop ──► fitPart(draft, part, slot) ──► validate(draft')
 *   validate(draft) ──► describeLoadout(availability) ──► sheet, stage badges, preview host, Build button
 *   store.subscribe ──► createPartAvailability(tech, parts, state.tech) ──► palette locks, re-validate
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
  private readonly palette: PartPaletteView;
  private readonly stage: MechStageView;
  private readonly sheet: StatSheetView;
  private readonly saved: SavedLoadoutsView;
  private root: HTMLElement | undefined;
  private credits: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private buildButton: HTMLButtonElement | undefined;
  private mechName: HTMLInputElement | undefined;
  private draft: MechLoadout | undefined;
  private description: LoadoutDescription | undefined;
  /** What the tree has unlocked, recomputed once per store change. */
  private availability: PartAvailability = ALL_PARTS_AVAILABLE;
  /** The unlocked node ids the availability was built from, to skip a rebuild that would change nothing. */
  private availabilityKey: string | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session and the content the palette and validator read. */
  constructor(deps: MechBayScreenDeps) {
    this.deps = deps;
    this.sheet = new StatSheetView(deps.unitTuning.mech);
    this.palette = new PartPaletteView(
      {
        onHover: (part) => {
          this.previewPart(part);
        },
        onFit: (part) => {
          this.fit(part);
        },
        onDragStart: (part) => {
          this.stage.setDragging(part);
        },
        onDragEnd: () => {
          this.stage.setDragging(undefined);
        },
      },
      deps.parts,
    );
    this.stage = new MechStageView({
      onDrop: (part, utilityIndex) => {
        this.stage.setDragging(undefined);
        this.fit(part, utilityIndex);
      },
      onRemoveUtility: (index) => {
        if (this.draft) {
          this.validate(removeUtility(this.draft, index));
        }
      },
    });
    this.saved = new SavedLoadoutsView({
      onLoad: (loadout) => {
        this.validate(loadout);
        this.saved.setOpen(false);
        this.showStatus("");
      },
      onDelete: (name) => {
        this.dispatch(deleteLoadout(name));
      },
      onSave: () => {
        this.save();
      },
      onNameChange: (name) => {
        if (this.draft) {
          this.draft = { ...this.draft, name };
          this.refreshButtons(this.deps.session.state);
        }
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
    this.palette.mount(body);
    this.stage.mount(body);
    this.sheet.mount(body);
    layout.appendChild(body);
    const footer = doc.createElement("footer");
    footer.className = "tut-topbar tut-mech-bay__footer";
    this.saved.mount(footer);
    if (this.deps.blueprints?.length) {
      const select = doc.createElement("select");
      select.className = "tut-input";
      select.setAttribute("aria-label", "Example mech blueprints");
      const prompt = doc.createElement("option");
      prompt.value = "";
      prompt.textContent = "Try a blueprint…";
      select.appendChild(prompt);
      for (const [index, blueprint] of this.deps.blueprints.entries()) {
        const option = doc.createElement("option");
        option.value = String(index);
        option.textContent = blueprint.name;
        select.appendChild(option);
      }
      const choose = (): void => {
        const blueprint =
          select.value === ""
            ? undefined
            : this.deps.blueprints?.[Number(select.value)];
        if (blueprint) this.validate(blueprint);
        select.value = "";
      };
      select.addEventListener("change", choose);
      this.disposers.push(() => select.removeEventListener("change", choose));
      footer.appendChild(select);
    }
    layout.appendChild(footer);
    root.appendChild(layout);
    this.root = layout;

    const store = this.deps.session.store;
    const state = store?.getState();
    this.render(state);
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state);
    });

    const viewport = this.stage.viewport();
    if (viewport && this.deps.preview) {
      this.deps.preview.attach(viewport, {
        framed: (anchors) => {
          this.stage.setAnchors(anchors);
        },
      });
      this.stage.markAttached();
    }

    this.validate(this.initialDraft(state));
  }

  /** Unsubscribes, unmounts the views and removes the layout. */
  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.deps.preview?.release();
    this.palette.unmount();
    this.stage.unmount();
    this.saved.unmount();
    this.sheet.unmount();
    this.root?.remove();
    this.root = undefined;
    this.credits = undefined;
    this.status = undefined;
    this.buildButton = undefined;
    this.mechName = undefined;
  }

  // ===========================================
  // Draft
  // ===========================================

  /**
   * Makes `loadout` the draft: describes it, and pushes the sheet, the
   * badges, the palette marks, the picture and the buttons after it.
   */
  private validate(loadout: MechLoadout): void {
    this.draft = loadout;
    this.description = describeLoadout(
      loadout,
      this.deps.parts,
      this.deps.rating,
      this.deps.upgrades,
      this.availability,
    );
    this.sheet.update(this.result(), this.description.sheet?.weightBudget);
    this.sheet.preview(undefined);
    this.stage.setLoadout(loadout, this.deps.parts);
    this.stage.setErrors(this.description.errors);
    this.palette.setLoadout(loadout);
    this.saved.setName(loadout.name);
    // Drawn from the draft, not from the sheet: an over-weight mech is
    // still the mech the player is looking at, and hiding it on the
    // frame it goes invalid is the one moment they need to see it.
    void this.deps.preview?.show(loadout);
    this.refreshButtons(this.deps.session.state);
  }

  /** Fits a dropped or chosen part into the draft and re-validates. */
  private fit(part: MechPart, utilityIndex?: number): void {
    if (!this.draft) {
      return;
    }
    this.validate(fitPart(this.draft, part, this.deps.parts, utilityIndex));
    this.showStatus("");
  }

  /**
   * Shows on the sheet what fitting `part` would change (#1145), or
   * clears the preview when the pointer left the palette.
   */
  private previewPart(part: MechPart | undefined): void {
    if (!this.draft || !this.description || part === undefined) {
      this.sheet.preview(undefined);
      return;
    }
    const next = describeLoadout(
      fitPart(this.draft, part, this.deps.parts),
      this.deps.parts,
      this.deps.rating,
      this.deps.upgrades,
      this.availability,
    );
    this.sheet.preview(
      sheetPreview(this.description.sheet, next, this.deps.unitTuning.mech),
    );
  }

  /** The description as the verdict the sheet and buttons read. */
  private result(): Result<MechStatSheet, LoadoutError[]> {
    const description = this.description;
    if (description?.sheet === undefined || description.errors.length > 0) {
      return err([...(description?.errors ?? [])]);
    }
    return ok(description.sheet);
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

  /** Saves the draft under its name. */
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
    this.refreshAvailability(state);
    this.refreshButtons(state);
  }

  /**
   * Rebuilds what the tree has unlocked when the unlocked set changed
   * (#1171): marks the palette's locked parts and re-validates the
   * draft, so a `part-locked` error appears or clears with the tree.
   * With no campaign every part is offered, as the editor always did.
   */
  private refreshAvailability(state: GameState | undefined): void {
    const key = state?.tech.unlocked.join(",") ?? "";
    if (key === this.availabilityKey) {
      return;
    }
    this.availabilityKey = key;
    this.availability = state
      ? createPartAvailability(this.deps.tech, this.deps.parts, state.tech)
      : ALL_PARTS_AVAILABLE;
    this.palette.setLocked(this.lockedParts());
    if (this.draft) {
      this.validate(this.draft);
    }
  }

  /**
   * Every part the availability refuses, with the name of the node that
   * unlocks it, found by scanning the tree once.
   */
  private lockedParts(): ReadonlyMap<string, string> {
    const locked = new Map<string, string>();
    for (const node of this.deps.tech.listNodes()) {
      for (const partId of partIdsOf(node)) {
        if (!this.availability.isAvailable(partId)) {
          locked.set(partId, node.name);
        }
      }
    }
    return locked;
  }

  /**
   * Save needs a campaign and a valid draft; Build additionally needs the
   * treasury to cover the sheet's total cost, which the button shows.
   */
  private refreshButtons(state: GameState | undefined): void {
    if (!this.buildButton) {
      return;
    }
    const result = this.result();
    const hasCampaign = state !== undefined;
    this.saved.setSaveEnabled(hasCampaign && result.ok);
    if (result.ok) {
      const cost = result.value.totalCost;
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

  /** The header: title, credits, status, mech name and Build, and the way back. */
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
    const techTree = this.createButton(doc, "tech-tree", "Tech tree", false);
    this.listen(techTree, () => {
      this.deps.router.navigate("tech-tree");
    });
    const roster = this.createButton(doc, "roster", "Roster", false);
    this.listen(roster, () => {
      this.deps.router.navigate("roster");
    });

    bar.append(
      title,
      credits,
      spacer,
      status,
      mechName,
      build,
      techTree,
      roster,
    );
    this.credits = credits;
    this.status = status;
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

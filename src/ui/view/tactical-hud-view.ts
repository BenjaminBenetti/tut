import type { Result } from "../../core/model/result";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { attack } from "../../tactical/model/attack-command";
import type { AttackPreview } from "../../tactical/model/attack-preview";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import { endTurn } from "../../tactical/model/end-turn-command";
import { move } from "../../tactical/model/move-command";
import { overwatch } from "../../tactical/model/overwatch-command";
import { extract } from "../../tactical/model/extract-command";
import { interact } from "../../tactical/model/interact-command";
import type { ObjectiveTuning } from "../../tactical/model/objective-tuning";
import { reload } from "../../tactical/model/reload-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalError } from "../../tactical/model/tactical-error";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { LayerFocus } from "../../graphics/model/layer-focus";
import type { MissionView } from "../../tactical/model/mission-view";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Team, Unit, UnitId } from "../../tactical/model/unit";
import type { WeaponId } from "../../tactical/model/unit-weapon";
import {
  enemyAttackTargets,
  findAttackTarget,
} from "../../tactical/service/attack-target-service";
import {
  attacksRemaining,
  previewAttack,
  weaponOptions,
} from "../../tactical/service/combat-service";
import { viewFor } from "../../tactical/service/mission-view-service";
import type { MoveGraph } from "../../tactical/service/movement-service";
import {
  buildMoveGraph,
  pathTo,
} from "../../tactical/service/movement-service";
import type { ReachableObjective } from "../../tactical/service/objective-service";
import type {
  TacticalAction,
  TacticalIntent,
  TacticalInvokeTarget,
} from "../model/tactical-intent";
import type { GameState } from "../../save/model/game-state";
import { describeRefusal, namesFor } from "../service/tactical-error-text";
import type { UnitAction } from "../service/action-availability";
import { actionRefusal, interactTarget } from "../service/action-availability";
import type { WheelContext, WheelPage } from "../service/action-wheel";
import {
  actionWheel,
  parseWheelChoice,
  weaponWheel,
} from "../service/action-wheel";
import { EndTurnView } from "./end-turn-view";
import { EventLogView } from "./event-log-view";
import { HitPreviewView } from "./hit-preview-view";
import { ObjectiveTrackerView } from "./objective-tracker-view";
import type { ScreenAnchor } from "./radial-menu-view";
import { RadialMenuView } from "./radial-menu-view";
import type {
  PhaseAnnouncement,
  PhaseBannerOptions,
} from "./phase-banner-view";
import { PhaseBannerView } from "./phase-banner-view";
import { TURN_STARTED } from "../../tactical/model/turn-started-event";
import { TurnBannerView } from "./turn-banner-view";
import { UnitCardView } from "./unit-card-view";
import { SquadStripView, playerUnits } from "./squad-strip-view";

// ===========================================
// Types
// ===========================================

/**
 * Whether the HUD is aiming. Moving is what a player does most, so it is
 * the resting state and no mode has to be chosen before walking a unit
 * (#519). Aiming is entered by opening the wheel on an enemy (#1112) or
 * by the keyboard — Attack's letter, or cycling targets — and left by
 * firing, cancelling or dismissing the wheel.
 */
export type HudMode = "move" | "attack";

/** The state the HUD falls back to: a right click on a reachable tile walks there. */
export const DEFAULT_HUD_MODE: HudMode = "move";

/** What the HUD reports back to its owner. */
export interface TacticalHudHandlers {
  /** A command the player asked for; the owner dispatches it and reports refusals through `showStatus`. */
  readonly onCommand: (command: TacticalCommand) => void;
  /** The player asked to leave the mission screen. */
  readonly onBack: () => void;
  /**
   * Bring a unit on screen (#1041). Absent in headless callers, which
   * then simply do not move the camera.
   */
  readonly onLookAt?: (unitId: UnitId) => void;
  /**
   * Words to raise above a unit — why an action was refused (#1030), and
   * in time what one did (#1029). Absent in headless callers, which then
   * still get the status line.
   */
  readonly onNotice?: (unitId: UnitId, text: string) => void;
  /**
   * Where a world thing is on screen, for anchoring the wheel (#529,
   * ADR 0007 §2.1). The HUD projects nothing itself; the scene owns the
   * camera. Absent in tests and headless callers, and the wheel simply
   * does not open without it.
   */
  readonly anchorFor?: (
    target: TacticalInvokeTarget,
  ) => ScreenAnchor | undefined;
  /**
   * Selection or armed intent changed, so the overlays the scene draws
   * are stale (#590).
   *
   * Before this, the only thing that pushed overlay state to the scene
   * was an intent arriving *from* the scene, so state the HUD changed on
   * its own — #522's range key, say — did not reach the map until the
   * player next clicked it. Optional, so a HUD built without a scene
   * needs no stub.
   */
  readonly onViewChange?: () => void;
  /**
   * The player asked to move the view `delta` storeys (#961), from the
   * banner's buttons rather than from the keys.
   *
   * Optional so a HUD built without a scene needs no stub; the readout
   * still shows whatever `setLayerFocus` was last given.
   */
  readonly onLayerStep?: (delta: number) => void;
}

/** What the HUD needs injected. */
export interface TacticalHudDeps {
  /** Tuning handed to `previewAttack`; the HUD never computes a number itself. */
  readonly combatTuning: CombatTuning;
  /** Tuning handed to `reachableObjectives`; the HUD judges no distance itself. */
  readonly objectiveTuning: ObjectiveTuning;
  /** Hold time and timers for the phase banner; the defaults are the DOM's. */
  readonly phaseBanner?: PhaseBannerOptions;
}

/** Which page of the wheel is open. */
type WheelPageKind = "actions" | "weapons";

// ===========================================
// Constants
// ===========================================

/** Actions a unit performs, and so the ones that can be refused (#1030). */
const REFUSABLE = new Set<string>([
  "move",
  "attack",
  "overwatch",
  "reload",
  "interact",
  "extract",
]);

/** Which team acts in which phase. */
const TEAM_FOR_PHASE: Readonly<Record<TacticalState["phase"], Team>> = {
  player: "tdf",
  bugs: "bugs",
};

/** The pointer events the HUD's panels keep from the map picker beneath. */
const POINTER_EVENTS = ["pointerdown", "pointerup", "pointermove"] as const;

// ===========================================
// TacticalHudView
// ===========================================

/**
 * The mission HUD (GDD §6.2) composed from its parts, plus the small
 * amount of presentation state the parts share: which unit is selected,
 * whether it is aiming, and which enemy is being previewed. Every number
 * on screen comes from the mission state or `previewAttack`.
 *
 * The actions live on the **wheel** (#1112), an in-world ring opened by
 * a left click on the thing the action is about; the bottom of the HUD
 * keeps only End turn.
 *
 * ```
 *   intent select-unit ──▶ friendly, not selected ──▶ select it (card follows)
 *                      ├─▶ the selected unit     ──▶ wheel: overwatch / reload / interact / board
 *                      └─▶ enemy                 ──▶ aim at it, wheel: attack (weapons) / …
 *   intent select-spawner ──▶ aim at it, wheel: attack / interact / …
 *   intent select-tile ──▶ wheel: move / board / overwatch / reload
 *   intent invoke tile ──▶ pathTo ──▶ onCommand(move(selected, path))
 *                                └─ undefined ──▶ "out of reach"
 *   intent action      ──▶ letters: arm, cycle, dispatch, cancel
 *   intent end-turn    ──▶ onCommand(endTurn())
 *   wheel entry        ──▶ onCommand(attack | overwatch | reload | interact | extract)
 * ```
 */
export class TacticalHudView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: TacticalHudHandlers;
  private readonly deps: TacticalHudDeps;
  /** Traversal structures for the mission's map, built once and reused. */
  private graph: MoveGraph | undefined;
  /** The map `graph` was built from; a new mission's map rebuilds it. */
  private graphFor: TacticalState["map"] | undefined;
  private readonly banner: TurnBannerView;
  private readonly phases: PhaseBannerView;
  private readonly card = new UnitCardView();
  private readonly preview: HitPreviewView;
  private readonly objectives = new ObjectiveTrackerView();
  /** The force at a glance; a row selects and recovers a unit (#1041). */
  private readonly squad = new SquadStripView({
    onPick: (unitId) => {
      // A plain selection, never the wheel: the row is a way to find a
      // unit, not a click on it.
      this.selectUnit(unitId);
      // Unconditional here: the player asked for this unit by name, so
      // overriding their own panning is what they meant.
      this.handlers.onLookAt?.(unitId);
    },
  });
  /** The in-world action wheel (#529, #1112); opened by left click, closed by the world. */
  private readonly radial = new RadialMenuView({
    onSelect: (id) => {
      this.chooseFromMenu(id);
    },
    onDismiss: () => {
      this.dismissMenu();
    },
  });
  /**
   * What the open wheel belongs to. The wheel is dismissed by the world,
   * not only by the player (ADR 0007 §2.2): when its target stops being
   * drawn — killed, deselected, or unseen under fog — the anchor stops
   * resolving and the wheel closes itself.
   */
  private menuTarget: TacticalInvokeTarget | undefined;
  /** Which page is up: the actions, or the weapons behind Attack. */
  private menuPage: WheelPageKind = "actions";
  private readonly log = new EventLogView();
  private readonly endTurn: EndTurnView;
  private root: HTMLElement | undefined;
  private mission: TacticalState | undefined;
  /**
   * The mission as the player's side perceives it (ADR 0006). Kept
   * beside the true mission rather than replacing it: what is *shown*
   * and what can be *aimed at* come from here, so an enemy nobody has
   * spotted is neither counted nor cycled onto, while movement still
   * plans against the real board — a path routed through an unseen bug
   * would be refused by the rules and read as a bug in the HUD.
   */
  private view: MissionView | undefined;
  private selected: UnitId | undefined;
  /** The city the mission is fought over, set by the screen (#753). */
  private missionName: string | undefined;
  /**
   * The campaign the mission belongs to, set by the screen (#1040).
   *
   * Held for the roster: two squads of one template are Alpha and Bravo
   * to the debrief and were both "Rifle Squad" in here, so a mission
   * alone cannot say who did what.
   */
  private campaign: GameState | undefined;
  /** Which storey the scene draws, set by the screen (#961). */
  private layerFocus: LayerFocus | undefined;
  private target: UnitId | undefined;
  private mode: HudMode = DEFAULT_HUD_MODE;
  /**
   * Which weapon a keyboard-armed Attack fires with (#532). Undefined
   * means the unit's first, which is what a single-weapon unit always
   * uses. The wheel names its weapon on the entry instead.
   */
  private armedWeaponId: WeaponId | undefined;
  private weaponRangePinned = false;
  /** Torn down with the HUD; watches the side rail for hidden content (#657). */
  private sideOverflow: { readonly dispose: () => void } | undefined;
  /** Torn down with the HUD; keeps panel clicks off the map picker. */
  private pointerGuard: { readonly dispose: () => void } | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Where commands and navigation go. */
  constructor(handlers: TacticalHudHandlers, deps: TacticalHudDeps) {
    this.handlers = handlers;
    this.deps = deps;
    this.banner = new TurnBannerView({
      onBack: () => handlers.onBack(),
      onLayerStep: (delta) => handlers.onLayerStep?.(delta),
    });
    this.phases = new PhaseBannerView(deps.phaseBanner);
    this.preview = new HitPreviewView({
      onConfirm: () => {
        this.confirmAttack();
      },
    });
    this.endTurn = new EndTurnView({
      onEndTurn: () => {
        this.handleIntent({ kind: "end-turn" });
      },
    });
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the HUD under `parent`: banner on top, side column, End turn below. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const hud = doc.createElement("div");
    hud.id = "mission-hud";
    hud.className = "tut-hud";
    const top = doc.createElement("div");
    top.className = "tut-hud__top";
    const side = doc.createElement("aside");
    side.className = "tut-hud__side tut-stack";
    const bottom = doc.createElement("div");
    bottom.className = "tut-hud__bottom";
    this.banner.mount(top);
    this.radial.mount(hud);
    // The force first, then the selected unit's detail. The strip is the
    // overview and the card is the close-up; putting the close-up first
    // pushed the third unit below the fold, which the frame showed and
    // which defeats "the force at a glance" (#1041).
    this.squad.mount(side);
    this.card.mount(side);
    this.preview.mount(side);
    this.objectives.mount(side);
    this.log.mount(hud);
    this.endTurn.mount(bottom);
    hud.append(top, side, bottom);
    this.watchSideOverflow(side);
    this.guardPointer(hud);
    this.phases.mount(hud);
    parent.appendChild(hud);
    this.root = hud;
    this.refresh();
  }

  /**
   * Renders `mission`, dropping a selection or target that is gone, dead
   * or destroyed, and announces any phase change in `events` (#523). One
   * `EndTurn` can carry both the bug phase and the player's next turn,
   * which is why the banner takes the whole batch in order rather than a
   * diff of two states.
   */
  update(
    mission: TacticalState | undefined,
    events: readonly TacticalEvent[] = [],
  ): void {
    // A new mission starts a new log; the same one appends to it (#525).
    // On arrival the log is replayed rather than appended to, because
    // the handlers have already folded every event into `mission.log`
    // (#573): a mission opened fresh shows the turn it starts on, and
    // one resumed from a save shows everything that led to here, which
    // it never used to.
    const arrived =
      mission !== undefined && this.mission?.missionId !== mission.missionId;
    if (arrived) {
      this.log.clear();
    }
    this.mission = mission;
    this.view = mission === undefined ? undefined : viewFor(mission, "tdf");
    this.phases.announce(phaseChangesIn(events));
    this.log.append(
      arrived && mission ? mission.log : events,
      mission,
      this.campaign,
    );
    const aliveUnit = (id: UnitId | undefined): boolean =>
      id !== undefined &&
      (mission?.units.some((u) => u.id === id && u.hp > 0) ?? false);
    if (!aliveUnit(this.selected)) {
      this.selected = undefined;
      this.mode = DEFAULT_HUD_MODE;
    }
    // The target may be an egg spawner (#426), which is not in `units`.
    const target =
      mission && this.target !== undefined
        ? findAttackTarget(mission, this.target)
        : undefined;
    if (target === undefined || target.hp <= 0) {
      this.target = undefined;
    }
    this.refresh();
  }

  /** Shows a one-line message in the banner (a rejected command, for instance). */
  showStatus(message: string): void {
    this.banner.showStatus(message);
  }

  /** Removes the HUD. */
  unmount(): void {
    this.sideOverflow?.dispose();
    this.sideOverflow = undefined;
    this.pointerGuard?.dispose();
    this.pointerGuard = undefined;
    this.phases.unmount();
    this.endTurn.unmount();
    this.log.unmount();
    this.objectives.unmount();
    this.preview.unmount();
    this.card.unmount();
    this.banner.unmount();
    this.radial.unmount();
    this.root?.remove();
    this.root = undefined;
  }

  // ===========================================
  // State
  // ===========================================

  /** The selected unit, if any; the scene highlights it. */
  getSelectedUnitId(): UnitId | undefined {
    return this.selected;
  }

  /** Whether the HUD is aiming. */
  getMode(): HudMode {
    return this.mode;
  }

  /**
   * Names the mission for the banner — the city it is fought over,
   * resolved by the screen, which is the only layer that can see the
   * overworld (#753).
   *
   * Handed in rather than looked up: `TacticalState` carries no city,
   * and giving a tactical view the whole overworld to search would be
   * the wrong dependency for one string.
   *
   * @param name - The city's name, or `undefined` to clear it.
   */
  setMissionName(name: string | undefined): void {
    this.missionName = name;
    this.refresh();
  }

  /**
   * The campaign the mission belongs to, for roster identities (#1040).
   *
   * Handed in rather than looked up, for the same reason as the mission
   * name: a tactical view given the whole campaign to search would be
   * the wrong dependency, and the screen already holds it.
   *
   * @param campaign - The campaign, or undefined outside one.
   */
  setCampaign(campaign: GameState | undefined): void {
    this.campaign = campaign;
    this.refresh();
  }

  /**
   * Which storey the scene is drawing (#961).
   *
   * Handed in rather than derived: the cut is clamped against the map's
   * height by the scene, so the storey the player lands on is not always
   * the one the keypress asked for, and the HUD must show what happened
   * rather than what was requested.
   *
   * @param focus - The scene's focus, or `undefined` when none is attached.
   */
  setLayerFocus(focus: LayerFocus | undefined): void {
    this.layerFocus = focus;
    this.refresh();
  }

  /**
   * Whether the weapon-range marks should be drawn (#522).
   *
   * Aiming decides it, not selection (#590). "How far can I shoot?" is a
   * question the player asks while aiming, so the envelope answers it
   * while the HUD is aiming and stays out of the way otherwise. It used
   * to default to on for every selection, which put 109-157 marks on
   * the map the moment a unit was clicked.
   *
   * The key still pins the marks up for a player who wants them
   * permanently; pinning is kept apart from the mode so aiming and
   * disarming cannot silently unpin them.
   */
  isWeaponRangeVisible(): boolean {
    return this.mode === "attack" || this.weaponRangePinned;
  }

  /** The enemy being previewed — a unit or an egg spawner (#426) — if any. */
  getTargetUnitId(): UnitId | undefined {
    return this.target;
  }

  // ===========================================
  // Intents
  // ===========================================

  /** Applies an intent from the input controller or the keyboard. */
  handleIntent(intent: TacticalIntent): void {
    switch (intent.kind) {
      case "select-unit":
        this.pointAtUnit(intent.unitId);
        return;
      case "select-spawner":
        this.pointAtEnemy({
          kind: "spawner",
          spawnerId: intent.spawnerId,
        });
        return;
      case "select-tile":
        this.pointAtTile(intent.tile);
        return;
      case "invoke":
        this.invokeAt(intent.target);
        return;
      case "action":
        this.handleAction(intent.action);
        return;
      case "end-turn":
        // Straight to the command rather than through `handleAction`, so
        // it closes the ring itself (#627).
        this.closeMenu();
        this.handlers.onCommand(endTurn());
        return;
    }
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * A left click on a unit (#1112): a friendly unit is selected, the
   * selected unit opens its own wheel, and an enemy opens the aiming
   * wheel. Resolved through the same port the combat rules use so an
   * egg spawner is picked exactly as a unit is (#426).
   *
   * ```
   *   nothing acting selected ──► select it (any team; a bug shows its card)
   *   the selected unit       ──► wheel: overwatch / reload / interact / board
   *   other team              ──► aim, wheel: attack / …
   *   friendly                ──► select it
   * ```
   */
  private pointAtUnit(unitId: UnitId): void {
    const mission = this.mission;
    if (!mission) {
      return;
    }
    const picked = findAttackTarget(mission, unitId);
    if (!picked || picked.hp <= 0) {
      return;
    }
    const actor = this.actingSelection();
    if (actor !== undefined && picked.team !== actor.team) {
      this.pointAtEnemy({ kind: "unit", unitId });
      return;
    }
    if (actor?.id === unitId) {
      this.openWheel({ kind: "unit", unitId });
      this.refresh();
      return;
    }
    if (picked.kind !== "unit") {
      return;
    }
    this.selectUnit(unitId);
  }

  /**
   * A left click on an enemy unit or an egg spawner with an acting unit
   * selected: aim at it and open the wheel there. Aiming is what makes
   * the scene draw the sight cue and the envelope (#590) and the panel
   * show the preview, so the click tells the player what the wheel is
   * about before they read it.
   */
  private pointAtEnemy(target: TacticalInvokeTarget): void {
    const mission = this.mission;
    if (!mission || target.kind === "tile" || !this.actingSelection()) {
      return;
    }
    const targetId = target.kind === "unit" ? target.unitId : target.spawnerId;
    const picked = findAttackTarget(mission, targetId);
    if (!picked || picked.hp <= 0) {
      return;
    }
    this.closeMenu();
    if (this.mode !== "attack") {
      // Entering the aim fresh fires the unit's first weapon; a weapon
      // armed from the keyboard (#532) survives a click on the target.
      this.armedWeaponId = undefined;
    }
    this.mode = "attack";
    this.target = targetId;
    this.openWheel(target);
    this.refresh();
  }

  /** A left click on a tile with an acting unit selected: the wheel opens there. */
  private pointAtTile(tile: TileCoord): void {
    if (!this.actingSelection()) {
      return;
    }
    this.openWheel({ kind: "tile", tile });
    this.refresh();
  }

  /**
   * Walks the selected unit wherever the right button landed (#520,
   * #1112). Only a tile is walked to: right-clicking an enemy while
   * aiming from the keyboard fires, as the commit gesture it has been
   * since #520, and anything else is ignored rather than guessed at.
   *
   * ```
   *   tile                         ──► moveTo(tile)
   *   unit / spawner while aiming  ──► fire on it
   *   anything else                ──► ignored
   * ```
   */
  private invokeAt(target: TacticalInvokeTarget): void {
    if (this.selected === undefined) {
      return;
    }
    // A right click is a new decision; whatever the wheel was asking
    // about is over (#627).
    this.closeMenu();
    if (target.kind === "tile") {
      this.moveTo(target.tile);
      return;
    }
    if (this.mode === "attack") {
      this.fireAt(target.kind === "unit" ? target.unitId : target.spawnerId);
      return;
    }
    this.refresh();
  }

  /**
   * Marks the wheel open on `target`, or leaves it closed when there is
   * nothing to offer or nowhere to draw it (#529, #1112). The caller
   * refreshes: the page is drawn by `followMenu` on every refresh, so
   * what is on screen is always the page for the mission as it is now.
   *
   * Entries come from `actionWheel`, which asks the **same predicates
   * the rules use**, so the wheel never offers a shot the rules then
   * refuse.
   */
  private openWheel(target: TacticalInvokeTarget): void {
    const anchor = this.handlers.anchorFor?.(target);
    if (!anchor || !this.mission || this.selected === undefined) {
      return;
    }
    this.menuTarget = target;
    this.menuPage = "actions";
    if (this.pageFor(target, "actions").items.length === 0) {
      this.menuTarget = undefined;
    }
  }

  /** The wheel page for `target`, built against the mission as it is now. */
  private pageFor(
    target: TacticalInvokeTarget,
    page: WheelPageKind,
  ): WheelPage {
    const mission = this.mission;
    const unitId = this.selected;
    if (!mission || unitId === undefined) {
      return { items: [] };
    }
    const ctx: WheelContext = {
      mission,
      unitId,
      graph: this.moveGraphFor(mission),
      names: namesFor(mission, this.campaign),
      deps: this.deps,
    };
    if (page === "weapons" && target.kind !== "tile") {
      return weaponWheel(
        target.kind === "unit" ? target.unitId : target.spawnerId,
        ctx,
      );
    }
    return actionWheel(target, ctx);
  }

  /**
   * Keeps an open wheel on its target, or closes it (ADR 0007 §2.2).
   *
   * The anchor is re-resolved from the world every refresh, so a wheel
   * follows its unit as the camera moves and closes itself the moment
   * that unit stops being drawn — which under fog of war includes a bug
   * walking out of sight, not only one that died.
   */
  private followMenu(): void {
    const target = this.menuTarget;
    if (target === undefined) {
      // Reconciles state to the DOM in one place: anything that drops the
      // target closes the ring, rather than each caller remembering to.
      // This early return used to leave the ring on screen for the rest
      // of the mission (#627).
      this.radial.close();
      return;
    }
    const anchor = this.handlers.anchorFor?.(target);
    if (!anchor || !this.mission || this.selected === undefined) {
      this.closeMenu();
      return;
    }
    // Recomputed rather than remembered, so the hub's hit chance is the
    // one that applies now: `open` re-renders in place by design.
    const { items, hub } = this.pageFor(target, this.menuPage);
    if (items.length === 0) {
      this.closeMenu();
      return;
    }
    this.radial.open(items, hub, anchor);
  }

  /**
   * Puts the ring away and forgets what it belonged to. The one way the
   * wheel closes, so no path can drop the target while leaving the ring
   * on screen — which is what stranded it over the map (#627).
   */
  private closeMenu(): void {
    this.menuTarget = undefined;
    this.menuPage = "actions";
    this.radial.close();
  }

  /**
   * The player dismissed the wheel — Escape, or a press outside it. Only
   * the ring goes: an aim taken by opening the wheel on an enemy stays,
   * with its preview and its Fire button in the panel, until the player
   * cancels, fires, walks or picks something else. The press that
   * dismisses the ring is often the press on that Fire button, and
   * clearing the aim here would empty the panel under the click.
   */
  private dismissMenu(): void {
    this.closeMenu();
    this.refresh();
  }

  /** Dispatches the command a wheel entry stands for, or turns the page. */
  private chooseFromMenu(id: string): void {
    const choice = parseWheelChoice(id);
    const unitId = this.selected;
    const target = this.menuTarget;
    if (choice === undefined || unitId === undefined || target === undefined) {
      this.closeMenu();
      return;
    }
    // Turning the page keeps the ring; everything else closes it first,
    // and unconditionally: the view reports a choice but does not hide
    // itself, so every path out of here has to (#627).
    if (choice.action === "attack" && choice.weaponId === undefined) {
      const weapons = this.mission
        ? weaponOptions(this.mission, unitId, this.deps.combatTuning)
        : [];
      if (weapons.length > 1) {
        this.menuPage = "weapons";
        this.refresh();
        return;
      }
    }
    if (choice.action === "back") {
      this.menuPage = "actions";
      this.refresh();
      return;
    }
    this.closeMenu();
    switch (choice.action) {
      case "move":
        this.moveTo(choice.tile);
        return;
      case "attack":
        this.armedWeaponId = choice.weaponId;
        this.fireAt(choice.targetId);
        return;
      case "overwatch":
        this.handlers.onCommand(overwatch(unitId));
        break;
      case "reload":
        this.handlers.onCommand(reload(unitId));
        break;
      case "interact":
        this.handlers.onCommand(interact(unitId, choice.objectiveId));
        break;
      case "extract":
        this.handlers.onCommand(extract(unitId));
        break;
    }
    this.refresh();
  }

  /**
   * Walks the selected unit to a clicked tile (#488). The rules compute
   * the route: `pathTo` returns every tile stepped through, which is what
   * `Move` validates against, so a click anywhere in the painted move
   * range works rather than only an orthogonally adjacent one.
   *
   * ```
   *   pathTo undefined ──► "out of reach", nothing dispatched
   *   path []          ──► the unit's own tile; nothing dispatched
   *   otherwise        ──► onCommand(move(unit, path))
   * ```
   */
  private moveTo(tile: TileCoord): void {
    const mission = this.mission;
    if (!mission || this.selected === undefined) {
      return;
    }
    // A right click reaches here with anything selected — including a
    // bug the player tapped to read its card. That one stays a quiet
    // no-op: the player did not ask it to walk, so there is nothing to
    // refuse.
    //
    // Their own unit with no action points did ask, and says so (#1027).
    const refusal = this.refusalFor("move");
    if (refusal !== undefined) {
      if (refusal.kind === "no-action-points") {
        this.announceRefusal(refusal);
      }
      return;
    }
    const path = pathTo(
      mission,
      this.selected,
      tile,
      this.moveGraphFor(mission),
    );
    if (path === undefined) {
      this.showStatus("That tile is out of reach this turn.");
      return;
    }
    this.mode = DEFAULT_HUD_MODE;
    this.target = undefined;
    if (path.length > 0) {
      this.handlers.onCommand(move(this.selected, path));
    }
    this.refresh();
  }

  /**
   * The mission map's traversal structures, built on first use and kept
   * until the map changes. Building walks every tile, and a player clicks
   * far more often than a mission changes map.
   */
  private moveGraphFor(mission: TacticalState): MoveGraph {
    if (this.graph === undefined || this.graphFor !== mission.map) {
      this.graph = buildMoveGraph(mission.map);
      this.graphFor = mission.map;
    }
    return this.graph;
  }

  /**
   * Selects a unit outright: the card follows, aiming stops, the wheel
   * closes. Any living unit can be selected — a bug, to read its card —
   * but only the acting side's units get a wheel.
   */
  private selectUnit(unitId: UnitId): void {
    const mission = this.mission;
    if (!mission) {
      return;
    }
    // The ring belongs to the decision that opened it. Picking something
    // else is a new decision, so the old one goes away (#627).
    this.closeMenu();
    const picked = this.unit(unitId);
    if (!picked || picked.hp <= 0) {
      return;
    }
    this.selected = unitId;
    this.target = undefined;
    this.armedWeaponId = undefined;
    this.mode = DEFAULT_HUD_MODE;
    this.refresh();
  }

  /**
   * Arms, cancels, cycles or dispatches per a keyboard action. The
   * letters reach the same commands the wheel does, without the pointer.
   */
  private handleAction(action: TacticalAction): void {
    // Arming, cancelling, ending the turn: all of them move on from
    // whatever the ring was asking about (#627).
    this.closeMenu();
    // An attempted action that cannot happen says why, above the unit
    // that could not act (#1030). Only the actions a unit performs;
    // `next-unit`, `cancel` and the rest are view controls with nothing
    // to refuse.
    const refusal = REFUSABLE.has(action)
      ? this.refusalFor(action as UnitAction)
      : undefined;
    if (refusal !== undefined) {
      this.announceRefusal(refusal);
      return;
    }
    switch (action) {
      case "move":
        if (this.canAct()) {
          this.mode = DEFAULT_HUD_MODE;
          this.target = undefined;
        }
        break;
      case "attack":
        if (this.canAct()) {
          this.armAttack();
        }
        break;
      case "overwatch":
        if (this.canAct() && this.selected !== undefined) {
          this.handlers.onCommand(overwatch(this.selected));
        }
        break;
      case "reload":
        if (this.canAct() && this.selected !== undefined) {
          this.handlers.onCommand(reload(this.selected));
        }
        break;
      case "extract":
        if (this.selected !== undefined) {
          this.handlers.onCommand(extract(this.selected));
        }
        break;
      case "interact": {
        const target = this.interactTarget();
        if (target && this.selected !== undefined) {
          this.handlers.onCommand(interact(this.selected, target.objective.id));
        }
        break;
      }
      case "cancel":
        this.mode = DEFAULT_HUD_MODE;
        this.target = undefined;
        break;
      case "next-unit":
        this.selectNextActor();
        break;
      case "next-target":
        this.selectNextTarget();
        break;
      case "toggle-range":
        this.weaponRangePinned = !this.weaponRangePinned;
        break;
    }
    this.refresh();
  }

  /**
   * Fires at a target without needing the preview confirmed first: the
   * wheel entry and the right button are the commit gesture (#520). An
   * illegal shot is dispatched and refused by the rules, so the reason
   * lands in the status line rather than the click being swallowed.
   */
  private fireAt(targetId: string): void {
    this.target = targetId;
    this.confirmAttack();
  }

  /**
   * Arms Attack from the keyboard, and on a repeat press moves to the
   * unit's next weapon (#532). A unit with one weapon behaves as it
   * always did: press again to disarm.
   */
  private armAttack(): void {
    const mission = this.mission;
    const selected = this.unit(this.selected);
    const weapons =
      mission && selected
        ? weaponOptions(mission, selected.id, this.deps.combatTuning)
        : [];
    if (this.mode !== "attack") {
      this.mode = "attack";
      // A unit with one weapon sends a bare attack, exactly as before
      // #532: naming the weapon would change a payload that every
      // single-weapon unit has always omitted.
      this.armedWeaponId =
        weapons.length > 1 ? weapons[0]?.weapon.id : undefined;
      this.target = undefined;
      return;
    }
    if (weapons.length <= 1) {
      this.mode = DEFAULT_HUD_MODE;
      this.armedWeaponId = undefined;
      this.target = undefined;
      return;
    }
    const at = weapons.findIndex((o) => o.weapon.id === this.armedWeaponId);
    const next = weapons[(at + 1) % weapons.length];
    this.armedWeaponId = next?.weapon.id;
    // The mark stays put: comparing two weapons against the same target
    // is the whole point of carrying two, so cycling re-previews what is
    // already picked rather than making the player click it again.
  }

  /** Dispatches the previewed attack and clears the preview. */
  private confirmAttack(): void {
    if (this.selected === undefined || this.target === undefined) {
      return;
    }
    this.handlers.onCommand(
      attack(this.selected, this.target, this.armedWeaponId),
    );
    this.target = undefined;
    this.mode = DEFAULT_HUD_MODE;
    this.refresh();
  }

  /**
   * Selects the next friendly unit with action points after the current
   * selection, wrapping, and brings it on screen (#1073).
   *
   * Centres for the same reason a squad-strip row does: the player asked
   * for a specific unit, so overriding their own panning is what they
   * meant. Before this, Tab and the strip disagreed about what selecting
   * a unit means, and Tab could hand the player an armed unit they could
   * not see.
   */
  private selectNextActor(): void {
    const mission = this.mission;
    if (!mission) {
      return;
    }
    const team = TEAM_FOR_PHASE[mission.phase];
    const actors = mission.units.filter(
      (u) => u.team === team && u.hp > 0 && u.ap > 0,
    );
    if (actors.length === 0) {
      return;
    }
    const at = actors.findIndex((u) => u.id === this.selected);
    const next = actors[(at + 1) % actors.length];
    if (next) {
      this.selected = next.id;
      this.target = undefined;
      this.mode = DEFAULT_HUD_MODE;
      this.handlers.onLookAt?.(next.id);
    }
  }

  /** How many of the player's units still have an action to spend (#1041). */
  private unspentCount(): number {
    const mission = this.mission;
    if (mission?.phase !== "player") {
      return 0;
    }
    return playerUnits(mission).filter((unit) => unit.hp > 0 && unit.ap > 0)
      .length;
  }

  /**
   * Why this action cannot happen for the selected unit, or `undefined`
   * when it can — the rules' own answer, shared with the wheel so an
   * entry and the refusal it explains cannot disagree.
   */
  private refusalFor(action: UnitAction): TacticalError | undefined {
    const mission = this.mission;
    if (mission === undefined || this.selected === undefined) {
      return undefined;
    }
    return actionRefusal(mission, this.selected, action, this.deps);
  }

  /**
   * How many attacks the card should show.
   *
   * `attacksRemaining` takes `Pick<Unit, "kind" | "ap">` — it cannot see
   * ammunition, so it answered `1` for a squad with an empty magazine
   * and the card advertised `ATTACKS 1` beside `ammo 0 / 3`. Asking
   * `refusalFor` first means the count and the words are one answer
   * rather than two (#1062).
   *
   * @param unit - The selected unit.
   * @returns Attacks left, or zero when the unit cannot attack at all.
   */
  private attacksLeftFor(unit: Unit): number {
    return this.refusalFor("attack") === undefined
      ? attacksRemaining(unit, this.deps.combatTuning)
      : 0;
  }

  /** Puts the refusal above the unit, and in the status line for the log. */
  private announceRefusal(error: TacticalError): void {
    // Named, not id'd (#1035), and with the campaign, like every other
    // name on this screen (#1047): without it the resolver falls back
    // to the template, so a refusal said `Rifle Squad` beside a card
    // reading `ALPHA`.
    const words = describeRefusal(error, namesFor(this.mission, this.campaign));
    this.showStatus(words);
    if (this.selected !== undefined) {
      this.handlers.onNotice?.(this.selected, words);
    }
  }

  /** Whether the selected unit may act at all: alive, its phase, an action left. */
  private canAct(): boolean {
    const mission = this.mission;
    const unit = this.unit(this.selected);
    return (
      mission !== undefined &&
      unit !== undefined &&
      unit.hp > 0 &&
      unit.ap > 0 &&
      unit.team === TEAM_FOR_PHASE[mission.phase]
    );
  }

  /**
   * The selected unit when it is one the player commands this phase,
   * else undefined. The wheel opens for these and nothing else: a bug
   * selected to read its card gets no actions, and neither does a squad
   * during the bug phase. Action points do not matter here — a spent
   * unit still gets a wheel, with every entry saying why it is closed.
   */
  private actingSelection(): Unit | undefined {
    const mission = this.mission;
    const unit = this.unit(this.selected);
    return mission !== undefined &&
      unit !== undefined &&
      unit.hp > 0 &&
      unit.team === "tdf" &&
      unit.team === TEAM_FOR_PHASE[mission.phase]
      ? unit
      : undefined;
  }

  /**
   * Arms attack mode and steps to the next thing the selected unit could
   * shoot — enemy units and standing egg spawners alike, in
   * `enemyAttackTargets` order, wrapping. A spawner has no mesh the
   * pointer can hit yet, so this is how one is aimed at (#426); it is
   * also how a target behind another is reached with the keyboard.
   *
   * Cycles every enemy rather than only the reachable ones, so the
   * preview panel can explain why an out-of-range target cannot be
   * fired on instead of the key silently skipping it.
   */
  private selectNextTarget(): void {
    const view = this.view;
    const selected = this.unit(this.selected);
    if (!view || !selected || !this.canAct()) {
      return;
    }
    // From the view, so the key never steps onto a bug the player has
    // never seen — which would announce both that it exists and where.
    const targets = enemyAttackTargets(view, selected.team);
    if (targets.length === 0) {
      return;
    }
    const at = targets.findIndex((t) => t.id === this.target);
    this.mode = "attack";
    this.target = targets[(at + 1) % targets.length]?.id;
  }

  /** The nearest objective the selected unit could work, if any. */
  private interactTarget(): ReachableObjective | undefined {
    const mission = this.mission;
    if (!mission || this.selected === undefined) {
      return undefined;
    }
    return interactTarget(mission, this.selected, this.deps.objectiveTuning);
  }

  /** A unit of the current mission by id. */
  private unit(id: UnitId | undefined): Unit | undefined {
    return id === undefined
      ? undefined
      : this.mission?.units.find((u) => u.id === id);
  }

  /** The preview for the selected unit against the target, from the combat service. */
  private currentPreview(): Result<AttackPreview, TacticalError> | undefined {
    if (
      !this.mission ||
      this.selected === undefined ||
      this.target === undefined
    ) {
      return undefined;
    }
    return previewAttack(
      this.mission,
      this.selected,
      this.target,
      this.deps.combatTuning,
      this.armedWeaponId,
    );
  }

  /**
   * Keeps presses on the HUD's panels and the wheel off the map picker
   * beneath them (#1112).
   *
   * The HUD is mounted inside the viewport the picker listens on, so a
   * pointer event on a wheel entry bubbles up to the picker, which then
   * picks the tile under the entry and reports a click there. While a
   * tile click did nothing that was harmless; now it opens a wheel, so a
   * choice on one ring would open another behind it. Stopped at the HUD
   * root, after the panel has seen it: the grid itself lets events
   * through (`pointer-events: none`), so anything that reaches here
   * with a target inside it was aimed at a panel, not the map.
   */
  private guardPointer(hud: HTMLElement): void {
    const stop = (event: Event): void => {
      if (event.target !== hud) {
        event.stopPropagation();
      }
    };
    for (const type of POINTER_EVENTS) {
      hud.addEventListener(type, stop);
    }
    this.pointerGuard = {
      dispose: () => {
        for (const type of POINTER_EVENTS) {
          hud.removeEventListener(type, stop);
        }
      },
    };
  }

  /**
   * Marks the side rail while it has content below the fold (#657).
   *
   * The rail is laid out correctly -- it is a grid row and stops above
   * the bottom bar. What goes wrong is quieter: a two-weapon mech's card
   * plus two objectives can outgrow the rail, so the last objective is
   * cut and **nothing says the rest is one scroll away.** A cut row with
   * no cue reads as a rendering fault rather than as more to see.
   *
   * Cannot be done in CSS alone: it depends on content height against
   * box height, which no selector can ask about. Re-measured when the
   * rail or any panel in it resizes, and on scroll, so the cue clears
   * once the player reaches the end.
   */
  private watchSideOverflow(side: HTMLElement): void {
    const measure = (): void => {
      const more = side.scrollHeight - side.clientHeight - side.scrollTop > 1;
      if (more) {
        side.dataset.overflow = "true";
      } else {
        delete side.dataset.overflow;
      }
    };
    side.addEventListener("scroll", measure, { passive: true });
    // The rail's own box rarely changes; its panels' heights change on
    // every selection, so watch those too. Guarded because the cue is
    // an enhancement, not a requirement: without a `ResizeObserver` the
    // scroll listener and the measure below still work, and a test
    // environment without one must not take the HUD down with it.
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    if (observer) {
      observer.observe(side);
      for (const panel of side.children) {
        observer.observe(panel);
      }
    }
    this.sideOverflow = {
      dispose: () => {
        observer?.disconnect();
        side.removeEventListener("scroll", measure);
      },
    };
    measure();
  }

  /** Pushes the mission and the presentation state into every part. */
  private refresh(): void {
    this.followMenu();
    const mission = this.mission;
    if (!mission) {
      this.banner.update(undefined);
      this.card.update(undefined, undefined);
      this.preview.update(undefined);
      this.objectives.update([], []);
      this.squad.update(undefined);
      this.endTurn.update({ playerPhase: false, unspent: 0 });
      return;
    }
    this.banner.update({
      // The name the screen resolved, never the id (#753). An em dash
      // when it has not been set: a visible absence is honest, where a
      // fallback to `mission.missionId` would be a permanent route back
      // to the defect — the same reasoning that kept #739's migration
      // from adding one.
      missionName: this.missionName ?? "—",
      turn: mission.turn,
      phase: mission.phase,
      tdfUnits: countAlive(mission, "tdf"),
      // Spotted bugs only: a count of every bug alive tells the player
      // how many are out there before anyone has seen one.
      bugUnits: this.view === undefined ? 0 : countAlive(this.view, "bugs"),
      // One-based for the player: "floor 1" is the ground floor, not
      // "floor 0". The scene counts storeys from zero.
      layer:
        this.layerFocus === undefined
          ? undefined
          : {
              storey: this.layerFocus.storey + 1,
              storeyCount: this.layerFocus.storeyCount,
            },
    });
    const selected = this.unit(this.selected);
    this.card.update(
      selected,
      selected ? mission.templates[selected.templateId] : undefined,
      selected ? this.attacksLeftFor(selected) : undefined,
      selected ? namesFor(mission, this.campaign).unit(selected.id) : undefined,
    );
    const target =
      this.target === undefined
        ? undefined
        : findAttackTarget(mission, this.target);
    const preview = this.currentPreview();
    this.preview.update(
      target && preview
        ? {
            targetName: target.name,
            preview,
            names: namesFor(mission, this.campaign),
          }
        : undefined,
    );
    const inReach = this.interactTarget();
    this.objectives.update(
      mission.objectives,
      mission.spawners,
      inReach?.objective.id,
    );
    // The rail names units through the same resolver as the card, the
    // banner and the log (#1040).
    const railNames = namesFor(mission, this.campaign);
    this.squad.update({
      units: playerUnits(mission),
      selectedId: this.selected,
      nameOf: (unitId) => railNames.unit(unitId),
    });
    this.endTurn.update({
      playerPhase: mission.phase === "player",
      unspent: this.unspentCount(),
    });
    // Last, so the listener reads the state the refresh just settled.
    this.handlers.onViewChange?.();
  }
}

// ===========================================
// Helpers
// ===========================================

/** Living units on one team. */
function countAlive(mission: TacticalState, team: Team): number {
  return mission.units.filter((u) => u.team === team && u.hp > 0).length;
}

// ===========================================
// Events
// ===========================================

/** The phase changes in a batch of tactical events, in the order they happened. */
function phaseChangesIn(
  events: readonly TacticalEvent[],
): readonly PhaseAnnouncement[] {
  return events
    .filter((event) => event.type === TURN_STARTED)
    .map((event) => ({
      phase: event.payload.phase,
      turn: event.payload.turn,
    }));
}

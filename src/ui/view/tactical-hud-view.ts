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
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Team, Unit, UnitId } from "../../tactical/model/unit";
import {
  enemyAttackTargets,
  findAttackTarget,
} from "../../tactical/service/attack-target-service";
import { previewAttack } from "../../tactical/service/combat-service";
import type { MoveGraph } from "../../tactical/service/movement-service";
import {
  buildMoveGraph,
  pathTo,
} from "../../tactical/service/movement-service";
import type { ReachableObjective } from "../../tactical/service/objective-service";
import { reachableObjectives } from "../../tactical/service/objective-service";
import type { TacticalIntent } from "../model/tactical-intent";
import type { ActionBarAction } from "./action-bar-view";
import { ActionBarView } from "./action-bar-view";
import { HitPreviewView } from "./hit-preview-view";
import { ObjectiveTrackerView } from "./objective-tracker-view";
import type {
  PhaseAnnouncement,
  PhaseBannerOptions,
} from "./phase-banner-view";
import { PhaseBannerView } from "./phase-banner-view";
import { TURN_STARTED } from "../../tactical/model/turn-started-event";
import { TurnBannerView } from "./turn-banner-view";
import { UnitCardView } from "./unit-card-view";

// ===========================================
// Types
// ===========================================

/**
 * Which action a click on the map performs. There is always one armed:
 * moving is what a player does most, so it is the resting state and no
 * mode has to be chosen before walking a unit (#519). Picking Attack
 * arms it until it is used or cancelled, and then Move comes back.
 */
export type HudMode = "move" | "attack";

/** The action the HUD falls back to: a click on a reachable tile walks there. */
export const DEFAULT_HUD_MODE: HudMode = "move";

/** What the HUD reports back to its owner. */
export interface TacticalHudHandlers {
  /** A command the player asked for; the owner dispatches it and reports refusals through `showStatus`. */
  readonly onCommand: (command: TacticalCommand) => void;
  /** The player asked to leave the mission screen. */
  readonly onBack: () => void;
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

/** Which team acts in which phase. */
const TEAM_FOR_PHASE: Readonly<Record<TacticalState["phase"], Team>> = {
  player: "tdf",
  bugs: "bugs",
};

// ===========================================
// TacticalHudView
// ===========================================

/**
 * The mission HUD (GDD §6.2) composed from its parts, plus the small
 * amount of presentation state the parts share: which unit is selected,
 * which action is armed, and which enemy is being previewed. Every
 * number on screen comes from the mission state or `previewAttack`.
 *
 * ```
 *   intent select-unit ──▶ attack mode + enemy? ──▶ preview target
 *                      └─▶ else select it (card follows)
 *   intent select-tile ──▶ move mode ──▶ pathTo ──▶ onCommand(move(selected, path))
 *                                             └─ undefined ──▶ "out of reach", stay armed
 *   intent action      ──▶ move / attack arm the mode; next-target cycles
 *                          what is aimed at; overwatch / reload
 *                          ──▶ onCommand; cancel clears; next-unit cycles
 *   intent end-turn    ──▶ onCommand(endTurn())
 *   Fire               ──▶ onCommand(attack(selected, target))
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
  private readonly actions: ActionBarView;
  private root: HTMLElement | undefined;
  private mission: TacticalState | undefined;
  private selected: UnitId | undefined;
  private target: UnitId | undefined;
  private mode: HudMode = DEFAULT_HUD_MODE;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Where commands and navigation go. */
  constructor(handlers: TacticalHudHandlers, deps: TacticalHudDeps) {
    this.handlers = handlers;
    this.deps = deps;
    this.banner = new TurnBannerView({ onBack: () => handlers.onBack() });
    this.phases = new PhaseBannerView(deps.phaseBanner);
    this.preview = new HitPreviewView({
      onConfirm: () => {
        this.confirmAttack();
      },
    });
    this.actions = new ActionBarView({
      onAction: (action) => {
        this.handleAction(action);
      },
    });
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the HUD under `parent`: banner on top, side column, action bar below. */
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
    this.card.mount(side);
    this.preview.mount(side);
    this.objectives.mount(side);
    this.actions.mount(bottom);
    hud.append(top, side, bottom);
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
    this.mission = mission;
    this.phases.announce(phaseChangesIn(events));
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
    this.phases.unmount();
    this.actions.unmount();
    this.objectives.unmount();
    this.preview.unmount();
    this.card.unmount();
    this.banner.unmount();
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

  /** The armed action. */
  getMode(): HudMode {
    return this.mode;
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
        this.selectUnit(intent.unitId);
        break;
      case "select-spawner":
        this.selectUnit(intent.spawnerId);
        return;
      case "select-tile":
        if (this.mode === "move" && this.selected !== undefined) {
          this.moveTo(intent.tile);
        }
        return;
      case "action":
        this.handleAction(intent.action);
        return;
      case "end-turn":
        this.handlers.onCommand(endTurn());
        return;
    }
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Walks the selected unit to a clicked tile (#488). The rules compute
   * the route: `pathTo` returns every tile stepped through, which is what
   * `Move` validates against, so a click anywhere in the painted move
   * range works rather than only an orthogonally adjacent one.
   *
   * ```
   *   pathTo undefined ──► "out of reach", move stays armed for another click
   *   path []          ──► the unit's own tile; disarm, nothing dispatched
   *   otherwise        ──► onCommand(move(unit, path)), disarm
   * ```
   *
   * A refusal leaves the mode armed on purpose: the player misjudged the
   * range, not the intent, and the next click should still be a move.
   */
  private moveTo(tile: TileCoord): void {
    const mission = this.mission;
    if (!mission || this.selected === undefined) {
      return;
    }
    // Move is armed by default now (#519), so a tile click reaches here
    // with anything selected — including a bug the player tapped to read
    // its card. Only the acting side walks; the rest is a quiet no-op
    // rather than a refusal the player did not ask for.
    if (!this.canAct()) {
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
   * In attack mode anything on the other side becomes the preview target,
   * resolved through the same port the combat rules use so an egg spawner
   * is picked exactly as a unit is (#426); otherwise the unit is selected.
   * An id that is not a unit can only ever be a target.
   */
  private selectUnit(unitId: UnitId): void {
    const mission = this.mission;
    if (!mission) {
      return;
    }
    const picked = findAttackTarget(mission, unitId);
    if (!picked || picked.hp <= 0) {
      return;
    }
    const selected = this.unit(this.selected);
    if (this.mode === "attack" && selected && picked.team !== selected.team) {
      this.target = unitId;
      this.refresh();
      return;
    }
    if (picked.kind !== "unit") {
      return;
    }
    this.selected = unitId;
    this.target = undefined;
    this.mode = DEFAULT_HUD_MODE;
    this.refresh();
  }

  /** Arms, cancels, cycles or dispatches per the action. */
  private handleAction(
    action: ActionBarAction | "next-unit" | "next-target" | "cancel",
  ): void {
    switch (action) {
      case "move":
      case "attack":
        if (this.canAct()) {
          // Pressing the armed action again disarms it, which for Move
          // means staying on Move: there is nothing quieter to fall to.
          this.mode = this.mode === action ? DEFAULT_HUD_MODE : action;
          this.target = undefined;
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
        if (this.canExtract() && this.selected !== undefined) {
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
      case "end-turn":
        this.handlers.onCommand(endTurn());
        break;
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
    }
    this.refresh();
  }

  /** Dispatches the previewed attack and clears the preview. */
  private confirmAttack(): void {
    if (this.selected === undefined || this.target === undefined) {
      return;
    }
    this.handlers.onCommand(attack(this.selected, this.target));
    this.target = undefined;
    this.mode = DEFAULT_HUD_MODE;
    this.refresh();
  }

  /** Selects the next friendly unit with action points after the current selection, wrapping. */
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
    }
  }

  /** True when the selected unit is on the acting side, alive, with action points. */
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
    const mission = this.mission;
    const selected = this.unit(this.selected);
    if (!mission || !selected || !this.canAct()) {
      return;
    }
    const targets = enemyAttackTargets(mission, selected.team);
    if (targets.length === 0) {
      return;
    }
    const at = targets.findIndex((t) => t.id === this.target);
    this.mode = "attack";
    this.target = targets[(at + 1) % targets.length]?.id;
  }

  /**
   * True when the selected unit can leave the map: a living unit of the
   * acting side standing on an extraction tile (#341). Action points do
   * not matter — walking out is free, so a unit that spent its turn
   * reaching the zone still leaves on the same turn.
   */
  private canExtract(): boolean {
    const mission = this.mission;
    const unit = this.unit(this.selected);
    return (
      mission !== undefined &&
      unit !== undefined &&
      unit.hp > 0 &&
      unit.team === TEAM_FOR_PHASE[mission.phase] &&
      mission.extraction.some(
        (tile) =>
          tile.x === unit.pos.x &&
          tile.y === unit.pos.y &&
          tile.z === unit.pos.z,
      )
    );
  }

  /**
   * The objective Interact would work: the nearest one the selected unit
   * can reach, or undefined when there is none. The rules answer this
   * (`reachableObjectives`), so the button offers exactly what the
   * handler would accept.
   */
  private interactTarget(): ReachableObjective | undefined {
    const mission = this.mission;
    if (!mission || this.selected === undefined) {
      return undefined;
    }
    return reachableObjectives(
      mission,
      this.selected,
      this.deps.objectiveTuning,
    )[0];
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
    );
  }

  /** Pushes the mission and the presentation state into every part. */
  private refresh(): void {
    const mission = this.mission;
    if (!mission) {
      this.banner.update(undefined);
      this.card.update(undefined, undefined);
      this.preview.update(undefined);
      this.objectives.update([], []);
      this.actions.update({
        canAct: false,
        playerPhase: false,
        mode: undefined,
        canExtract: false,
        canInteract: false,
      });
      return;
    }
    this.banner.update({
      missionId: mission.missionId,
      turn: mission.turn,
      phase: mission.phase,
      tdfUnits: countAlive(mission, "tdf"),
      bugUnits: countAlive(mission, "bugs"),
    });
    const selected = this.unit(this.selected);
    this.card.update(
      selected,
      selected ? mission.templates[selected.templateId] : undefined,
    );
    const target =
      this.target === undefined
        ? undefined
        : findAttackTarget(mission, this.target);
    const preview = this.currentPreview();
    this.preview.update(
      target && preview ? { targetName: target.name, preview } : undefined,
    );
    const inReach = this.interactTarget();
    this.objectives.update(
      mission.objectives,
      mission.spawners,
      inReach?.objective.id,
    );
    this.actions.update({
      canAct: this.canAct(),
      playerPhase: mission.phase === "player",
      mode: this.mode,
      reloadLabel: selected?.kind === "mech" ? "Vent" : "Reload",
      canExtract: this.canExtract(),
      canInteract: inReach !== undefined,
    });
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

import type { CommandError } from "../../core/model/command-error";
import type { Unsubscribe } from "../../core/model/event-bus";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { GameState } from "../../save/model/game-state";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import { finishMission } from "../../tactical/model/finish-mission-command";
import type { ObjectiveTuning } from "../../tactical/model/objective-tuning";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import type { TacticalIntent } from "../model/tactical-intent";
import type { TacticalSceneHost } from "../model/tactical-scene-host";
import type { PhaseBannerOptions } from "../view/phase-banner-view";
import { namesFor, refusalText } from "../service/tactical-error-text";
import { TacticalHudView } from "../view/tactical-hud-view";
import { actorOf, describeEvent, nameResolver } from "../view/event-vocabulary";

// ===========================================
// Types
// ===========================================

/** What the tactical screen needs from the app. */
export interface TacticalScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** Tuning the HUD hands to `previewAttack`; the screen computes no number itself. */
  readonly combatTuning: CombatTuning;
  /** Tuning the HUD hands to `reachableObjectives`; the screen judges no distance itself. */
  readonly objectiveTuning: ObjectiveTuning;
  /** Hold time and timers for the phase banner (#523); the defaults are the DOM's. */
  readonly phaseBanner?: PhaseBannerOptions;
  /** Builds and owns the three.js scene for the mission; absent in unit tests that only check the DOM. */
  readonly sceneHost?: TacticalSceneHost;
  /**
   * Also receives every intent from the input controller, after the HUD
   * has handled it; the screen records the last one on the body for the
   * Playwright specs.
   */
  readonly onIntent?: (intent: TacticalIntent) => void;
}

/**
 * The name of the city the active mission is fought over, or `undefined`
 * when there is no mission or its city cannot be found (#753).
 *
 * ```
 *   activeMission.missionId ──► overworld.missions ──► cityId ──► city.name
 * ```
 *
 * Returns `undefined` rather than falling back to the id: a banner
 * reading an em dash is a visible gap, while one reading `mission-1`
 * again is the defect wearing a fallback.
 *
 * @param state - The current game state.
 * @returns The city's name, or `undefined`.
 */
function missionCityName(state: GameState): string | undefined {
  const active = state.activeMission;
  if (active === undefined) {
    return undefined;
  }
  const mission = state.overworld.missions.find(
    (m) => m.id === active.missionId,
  );
  return mission === undefined
    ? undefined
    : findCity(state.overworld.map, mission.cityId)?.name;
}

// ===========================================
// TacticalScreen
// ===========================================

/**
 * The tactical mission screen (GDD §6): a viewport the scene host
 * renders into, with the mission HUD (#339) laid over it; the HUD's
 * banner is the one status row (#403). Reads
 * `activeMission` from the campaign store and re-renders the scene and
 * the HUD on every change; the HUD turns the scene's intents
 * into commands, which go through the store with refusals shown in the
 * HUD's banner. With no mission in progress it says so; the HUD's
 * banner is the one way back to the overworld. When the mission reports
 * an outcome the screen finishes it — `FinishMission` resolves it through
 * the tactical resolver and empties `activeMission` (#341) — and hands
 * over to the results screen.
 *
 * ```
 *   ┌ #tactical-viewport ◄── sceneHost.attach / update ───────────────────┐
 *   │   └ #mission-hud: #turn-banner (mission, turn, phase, counts, exit) │
 *   │                   #unit-card #hit-preview #objectives / #action-bar  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 *   host intents ──▶ hud.handleIntent ──▶ onCommand ──▶ store.dispatch
 *                └─▶ syncOverlays()                        range / cover / LOS overlays
 *   hud.onViewChange ─▶ syncOverlays()                        arming Attack shows the envelope
 *   store change ──▶ host.update(mission, tactical events)  animations, then units
 *                └─▶ mission.outcome set ──▶ FinishMission ──▶ "mission-results"
 * ```
 */
export class TacticalScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "tactical";
  private readonly deps: TacticalScreenDeps;
  private readonly hud: TacticalHudView;
  private root: HTMLElement | undefined;
  private viewport: HTMLElement | undefined;
  private note: HTMLElement | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private attachedMissionId: string | undefined;
  /** Last overlay state pushed to the scene, so an unchanged refresh costs nothing. */
  private overlayState:
    | {
        readonly selected: UnitId | undefined;
        readonly weaponRange: boolean;
        readonly target: UnitId | undefined;
      }
    | undefined;
  /** The mission `FinishMission` has already been dispatched for, so it is asked once. */
  private finishedMissionId: string | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session, tuning, scene host and the intent sink. */
  constructor(deps: TacticalScreenDeps) {
    this.deps = deps;
    this.hud = new TacticalHudView(
      {
        onCommand: (command) => {
          this.dispatch(command);
        },
        onBack: () => {
          this.deps.router.navigate("overworld");
        },
        // Bring a unit on screen (#1041). The camera rig has had
        // `lookAt` all along; until now nothing called it after the
        // opening frame, so a selected unit off screen had no way back.
        onLookAt: (unitId) => {
          this.deps.sceneHost?.lookAtUnit(unitId);
        },
        // A refusal is spoken above the unit that could not act (#1030),
        // through the same floater the damage numbers use.
        onNotice: (unitId, text) => {
          this.deps.sceneHost?.notice(unitId, text);
        },
        onViewChange: () => {
          this.syncOverlays();
        },
        // The banner's buttons take the same route the keys do (#961):
        // the scene clamps the step and reports where it landed, and
        // the readout follows that rather than the request.
        onLayerStep: (delta) => {
          this.hud.setLayerFocus(deps.sceneHost?.stepLayerFocus(delta));
        },
        // The scene owns the camera, so it is what can answer where a
        // world thing is on screen (ADR 0007 §2.1). The HUD anchors the
        // context menu to that point rather than to the click.
        anchorFor: (target) => deps.sceneHost?.screenPositionOf(target),
      },
      {
        combatTuning: deps.combatTuning,
        objectiveTuning: deps.objectiveTuning,
        phaseBanner: deps.phaseBanner,
      },
    );
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the viewport and HUD, attaches the scene and subscribes to the store. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-tactical";
    layout.dataset.screen = this.id;

    const viewport = doc.createElement("div");
    viewport.id = "tactical-viewport";
    viewport.className = "tut-tactical__viewport";
    layout.appendChild(viewport);
    this.hud.mount(viewport);

    const note = doc.createElement("p");
    note.className = "tut-dim tut-tactical__note";
    note.dataset.role = "no-mission";
    note.textContent = "No mission in progress.";
    note.hidden = true;
    layout.appendChild(note);

    root.appendChild(layout);
    this.root = layout;
    this.viewport = viewport;
    this.note = note;

    const store = this.deps.session.store;
    this.render(store?.getState());
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state, tacticalEventsOf(change.events));
    });
  }

  /** Unsubscribes, releases the scene and removes the layout. */
  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.deps.sceneHost?.release();
    this.attachedMissionId = undefined;
    // The next scene starts with no overlays, so the next push must run.
    this.overlayState = undefined;
    this.finishedMissionId = undefined;
    this.hud.unmount();
    this.root?.remove();
    this.root = undefined;
    this.viewport = undefined;
    this.note = undefined;
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** Pushes the mission into the bar, the HUD and the scene host, with the events that produced it. */
  private render(
    state: GameState | undefined,
    events: readonly TacticalEvent[] = [],
  ): void {
    const mission = state?.activeMission;
    if (this.note) {
      this.note.hidden = mission !== undefined;
    }
    // The banner names the city, not the mission id (#753). Only this
    // layer can resolve it: the HUD is handed a `TacticalState`, which
    // carries no city, and the mission itself is still in the offers
    // because `launch-mission-service` removes it only when the result
    // is stored — which is why this needs no persisted field, unlike the
    // debrief in #739.
    this.hud.setMissionName(
      state === undefined ? undefined : missionCityName(state),
    );
    this.hud.setCampaign(state);
    this.hud.update(mission, events);
    if (!mission) {
      return;
    }
    this.announce(mission, events, state);
    this.syncScene(mission, events);
    if (mission.outcome !== undefined) {
      this.finish(mission.missionId);
    }
  }

  /**
   * Puts every logged action above the unit that did it (#1029).
   *
   * Anything worth a line in the log is worth showing where it happened;
   * the log at the edge of the screen becomes the record and the
   * indicator becomes the notification. Movement is excluded — `actorOf`
   * says why — and events belonging to nobody in particular stay in the
   * log alone.
   *
   * The words are the log's own, from `event-vocabulary`, so the two can
   * never say different things about the same event.
   */
  private announce(
    mission: TacticalState,
    events: readonly TacticalEvent[],
    campaign: GameState | undefined,
  ): void {
    const host = this.deps.sceneHost;
    if (!host) {
      return;
    }
    // The campaign too, because the log resolves with it since #1047:
    // without it the indicator says "Rifle Squad" while the log line it
    // is meant to mirror says "Alpha", which is the one thing this
    // mechanism exists to prevent.
    const nameOf = nameResolver(mission, campaign);
    for (const event of events) {
      const unitId = actorOf(event);
      if (unitId === undefined) {
        continue;
      }
      const entry = describeEvent(event, nameOf);
      if (entry !== undefined) {
        host.notice(unitId, entry.text);
      }
    }
  }

  /**
   * Resolves a mission that has reported an outcome and opens the
   * debrief. Asked once per mission: `render` runs on every store change,
   * and the state carries the outcome from the moment the rules set it,
   * whether that was this session or a save reloaded after one. A refusal
   * stays on the mission with its reason in the banner, so a broken
   * debrief never strands the player on a dead screen.
   */
  private finish(missionId: string): void {
    if (this.finishedMissionId === missionId) {
      return;
    }
    this.finishedMissionId = missionId;
    const store = this.deps.session.store;
    if (!store) {
      return;
    }
    const result = store.dispatch(finishMission(missionId));
    if (!result.ok) {
      this.hud.showStatus(this.statusFor(result.error));
      return;
    }
    this.deps.router.navigate("mission-results");
  }

  /**
   * Brings the scene's overlays in step with the HUD, if anything they
   * depend on moved (#590).
   *
   * Deduped because recomputing them walks the movement graph, while the
   * HUD refreshes on every event in a turn; without the guard, arming
   * Attack once would rebuild the overlays on every subsequent banner
   * tick as well.
   */
  private syncOverlays(): void {
    const host = this.deps.sceneHost;
    // Before the scene is attached there is nothing to draw on, and the
    // HUD refreshes during mount; pushing then would seed the dedupe
    // with a selection the scene never received.
    if (!host || this.attachedMissionId === undefined) {
      return;
    }
    const selected = this.hud.getSelectedUnitId();
    const weaponRange = this.hud.isWeaponRangeVisible();
    const target = this.hud.getTargetUnitId();
    const pushed = this.overlayState;
    if (
      pushed !== undefined &&
      pushed.selected === selected &&
      pushed.weaponRange === weaponRange &&
      pushed.target === target
    ) {
      return;
    }
    this.overlayState = { selected, weaponRange, target };
    host.select(selected, target);
    host.setWeaponRangeVisible(weaponRange);
  }

  /** Attaches the scene on the first mission, updates it afterwards; never throws into the store. */
  private syncScene(
    mission: TacticalState,
    events: readonly TacticalEvent[],
  ): void {
    const host = this.deps.sceneHost;
    if (!host || !this.viewport) {
      return;
    }
    const intents = {
      emit: (intent: TacticalIntent): void => {
        if (intent.kind === "layer-step") {
          // A view change, not a mission one: it never reaches the HUD's
          // intent handling or the overlays (#961). The focus comes back
          // from the scene because clamping means the step the player
          // asked for is not always the one they get.
          this.hud.setLayerFocus(host.stepLayerFocus(intent.delta));
          this.recordIntent(intent);
          this.deps.onIntent?.(intent);
          return;
        }
        this.hud.handleIntent(intent);
        // The HUD owns selection: in attack mode a click on an enemy is
        // the preview target, not the selected unit, so the overlays
        // follow the unit whose card is up (#338).
        this.syncOverlays();
        this.recordIntent(intent);
        this.deps.onIntent?.(intent);
      },
    };
    const pending =
      this.attachedMissionId === mission.missionId
        ? host.update(mission, events)
        : host.attach(this.viewport, mission, intents);
    if (this.attachedMissionId !== mission.missionId) {
      // What a freshly built scene already shows: no selection, no
      // envelope. Recording it rather than pushing it keeps the attach
      // free of a redundant round trip, and the call below then pushes
      // only if the HUD is holding something different.
      this.overlayState = {
        selected: undefined,
        weaponRange: false,
        target: undefined,
      };
    }
    this.attachedMissionId = mission.missionId;
    this.syncOverlays();
    // A fresh scene opens on the top storey; show it before the player
    // touches a key, so the readout is never blank while the control is
    // live.
    this.hud.setLayerFocus(host.layerFocus());
    void pending.catch((error: unknown) => {
      console.error("Tactical scene failed", error);
    });
  }

  /** Mirrors the last intent to the body so end-to-end tests can watch it. */
  private recordIntent(intent: TacticalIntent): void {
    const body = this.root?.ownerDocument.body;
    if (!body) {
      return;
    }
    body.dataset.lastIntent =
      intent.kind === "action" ? intent.action : intent.kind;
    if (intent.kind === "select-unit") {
      body.dataset.selectedUnit = intent.unitId;
    }
    if (intent.kind === "select-spawner") {
      body.dataset.selectedSpawner = intent.spawnerId;
    }
    if (intent.kind === "select-tile") {
      body.dataset.selectedTile = `${intent.tile.x},${intent.tile.y},${intent.tile.z}`;
    }
  }

  /** Runs a HUD command through the store; a refusal lands in the HUD's banner. */
  private dispatch(command: TacticalCommand): void {
    const store = this.deps.session.store;
    if (!store) {
      this.hud.showStatus("No active campaign.");
      return;
    }
    const result = store.dispatch(command);
    this.hud.showStatus(result.ok ? "" : this.statusFor(result.error));
  }

  /**
   * The player's words for a refused command (#1035).
   *
   * `error.message` is written by the simulation and names its ids --
   * `Unit "unit-1" is already fully loaded` -- which is right for a log
   * and wrong for the one line the player reads. The typed refusal rides
   * along as `cause`, so the same resolver that phrases the HUD's own
   * previews phrases the dispatched ones, and the two agree.
   *
   * Resolved against the state the store is holding now. A refusal
   * leaves the state untouched, so that is the state the refused command
   * was judged against, and the names are the ones on screen.
   */
  private statusFor(error: CommandError): string {
    const state = this.deps.session.store?.getState();
    return refusalText(error, namesFor(state?.activeMission, state));
  }
}

// ===========================================
// Helpers
// ===========================================

/** The tactical events in a store change; everything else is the overworld's. */
function tacticalEventsOf(
  events: readonly { readonly type: string }[],
): TacticalEvent[] {
  return events.filter((e): e is TacticalEvent =>
    e.type.startsWith("tactical:"),
  );
}

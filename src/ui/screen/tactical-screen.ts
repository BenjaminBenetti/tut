import type { Unsubscribe } from "../../core/model/event-bus";
import type { GameState } from "../../save/model/game-state";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import { finishMission } from "../../tactical/model/finish-mission-command";
import type { ObjectiveTuning } from "../../tactical/model/objective-tuning";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import type { TacticalIntent } from "../model/tactical-intent";
import type { TacticalSceneHost } from "../model/tactical-scene-host";
import { TacticalHudView } from "../view/tactical-hud-view";

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
  /** Builds and owns the three.js scene for the mission; absent in unit tests that only check the DOM. */
  readonly sceneHost?: TacticalSceneHost;
  /**
   * Also receives every intent from the input controller, after the HUD
   * has handled it; the screen records the last one on the body for the
   * Playwright specs.
   */
  readonly onIntent?: (intent: TacticalIntent) => void;
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
 *                └─▶ host.select(hud.getSelectedUnitId())   range / cover / LOS overlays
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
      },
      {
        combatTuning: deps.combatTuning,
        objectiveTuning: deps.objectiveTuning,
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
    this.hud.update(mission);
    if (!mission) {
      return;
    }
    this.syncScene(mission, events);
    if (mission.outcome !== undefined) {
      this.finish(mission.missionId);
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
      this.hud.showStatus(result.error.message);
      return;
    }
    this.deps.router.navigate("mission-results");
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
        this.hud.handleIntent(intent);
        // The HUD owns selection: in attack mode a click on an enemy is
        // the preview target, not the selected unit, so the overlays
        // follow the unit whose card is up (#338).
        host.select(this.hud.getSelectedUnitId());
        this.recordIntent(intent);
        this.deps.onIntent?.(intent);
      },
    };
    const pending =
      this.attachedMissionId === mission.missionId
        ? host.update(mission, events)
        : host.attach(this.viewport, mission, intents);
    this.attachedMissionId = mission.missionId;
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
    this.hud.showStatus(result.ok ? "" : result.error.message);
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

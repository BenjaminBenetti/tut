import type { CommandError } from "../../core/model/command-error";
import type { Unsubscribe } from "../../core/model/event-bus";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { GameState } from "../../save/model/game-state";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import { finishMission } from "../../tactical/model/finish-mission-command";
import type { ObjectiveTuning } from "../../tactical/model/objective-tuning";
import type { PreviewDeps } from "../../tactical/service/combat-service";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { TURN_STARTED } from "../../tactical/model/turn-started-event";
import type { UnitId } from "../../tactical/model/unit";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import type { TacticalIntent } from "../model/tactical-intent";
import { TACTICAL_SHORTCUTS } from "../model/tactical-intent";
import type {
  TacticalSceneHost,
  TacticalUpdateHooks,
} from "../model/tactical-scene-host";
import type { PhaseBannerOptions } from "../view/phase-banner-view";
import { namesFor, refusalText } from "../service/tactical-error-text";
import { TacticalHudView } from "../view/tactical-hud-view";
import { actorOf, describeEvent } from "../view/event-vocabulary";

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
  /** The content the HUD's blast previews ask what would fall (#1121); absent in tests without one. */
  readonly previewDeps?: PreviewDeps;
  /** Hold time and timers for the phase banner (#523); the defaults are the DOM's. */
  readonly phaseBanner?: PhaseBannerOptions;
  /** Idle limit and timers for the playback watchdog (#1132); the defaults are the DOM's. */
  readonly playbackWatchdog?: PlaybackWatchdogOptions;
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
 * How the playback lock guards against a scene that never settles
 * (#1132). The lock is released for real when the scene settles and the
 * bug phase banner has passed; this is the net under that.
 */
export interface PlaybackWatchdogOptions {
  /** Longest the lock may hold with nothing happening on the map. */
  readonly idleMs?: number;
  /** Defaults to `setTimeout`. */
  readonly setTimer?: (run: () => void, ms: number) => number;
  /** Defaults to `clearTimeout`. */
  readonly clearTimer?: (handle: number) => void;
}

/**
 * Longest the controls stay held with no event beginning, no settle and
 * no banner change (#1132). A bug phase makes progress at least once a
 * second while it plays — every walk, shot and fade is an event, and
 * the watchdog restarts on each — so ten seconds of silence is a scene
 * that has stopped: a redraw that rejected, a frame loop that died, a
 * load that never came back. On a CI runner the lock once held for the
 * whole 60 s budget; the game should never freeze on presentation.
 */
export const PLAYBACK_IDLE_LIMIT_MS = 10_000;

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
 *   │                   #radial-menu — the action wheel, at the clicked   │
 *   │                   tile, enemy or unit (#1112)                        │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 *   host intents ──▶ hud.handleIntent ──▶ onCommand ──▶ store.dispatch
 *                └─▶ syncOverlays()                        range / cover / LOS overlays
 *   hud.onViewChange ─▶ syncOverlays()                        aiming shows the envelope
 *   store change ──▶ hud.update(mission)                     the board, at once
 *                ├─▶ a phase change? ──▶ setPlaying(true)      controls held (#1130)
 *                └─▶ host.update(mission, events, hooks)     one event at a time:
 *                     onEvent ──▶ hud.playEvent + notice        log line, banner, chip
 *                     onSettled ──▶ setPlaying(false)           controls released
 *                               ──▶ the debrief, if the mission is over
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
  /**
   * Paced batches still playing a phase change (#1130). The controls
   * are held while it is above zero; `playbackGeneration` lets a batch
   * orphaned by a new mission or an unmount release nothing.
   */
  private playingBatches = 0;
  private playbackGeneration = 0;
  /** What the HUD, the scene and the body were last told. */
  private playing = false;
  /**
   * Releases waiting on the phase banner (#1132): the scene has settled
   * but "Bug phase" is still up, so the controls wait for it to pass.
   */
  private readonly awaitingBanner = new Set<() => void>();
  private readonly idleLimitMs: number;
  private readonly setTimer: (run: () => void, ms: number) => number;
  private readonly clearTimer: (handle: number) => void;
  /** The watchdog for the batches playing now; one, restarted on every sign of life. */
  private watchdog: number | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session, tuning, scene host and the intent sink. */
  constructor(deps: TacticalScreenDeps) {
    this.deps = deps;
    this.idleLimitMs = deps.playbackWatchdog?.idleMs ?? PLAYBACK_IDLE_LIMIT_MS;
    this.setTimer =
      deps.playbackWatchdog?.setTimer ??
      ((run, ms) => globalThis.setTimeout(run, ms) as unknown as number);
    this.clearTimer =
      deps.playbackWatchdog?.clearTimer ??
      ((handle) => {
        globalThis.clearTimeout(handle);
      });
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
        // action wheel to that point rather than to the click.
        anchorFor: (target) => deps.sceneHost?.screenPositionOf(target),
        // The wheel's tile is framed on the map, so the ring and the
        // ground it belongs to read as one thing.
        onMarkTile: (tile) => {
          deps.sceneHost?.markTile(tile);
        },
        // The footprint of the shot being considered, painted on the
        // ground it would reach (#1121).
        onMarkBlast: (tiles) => {
          deps.sceneHost?.markBlast(tiles);
        },
        // The reach of the weapon rested on in the unit panel, painted
        // on the ground it can hit (#1132).
        onMarkWeaponRange: (tiles) => {
          deps.sceneHost?.markWeaponRange(tiles);
        },
        // The status chips sit at the top of each unit's model, which
        // only the scene can locate.
        headAnchorFor: (unitId) =>
          deps.sceneHost?.unitHeadScreenPosition(unitId),
      },
      {
        combatTuning: deps.combatTuning,
        objectiveTuning: deps.objectiveTuning,
        ...(deps.previewDeps === undefined
          ? {}
          : { previewDeps: deps.previewDeps }),
        phaseBanner: deps.phaseBanner,
        shortcuts: TACTICAL_SHORTCUTS,
      },
    );
    // A settled batch waiting on "Bug phase" is released the moment the
    // banner moves on (#1132); the HUD owns the banner, so it says when.
    this.hud.onPhaseBanner(() => {
      this.restartWatchdog();
      for (const check of [...this.awaitingBanner]) {
        check();
      }
    });
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
    // Nothing is playing on a fresh screen; said outright so a spec can
    // wait on the attribute from the first frame (#1130).
    doc.body.dataset.phasePlaying = "false";

    const store = this.deps.session.store;
    this.render(store?.getState());
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state, tacticalEventsOf(change.events));
    });
  }

  /** Unsubscribes, releases the lock and the scene, and removes the layout. */
  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    const body = this.root?.ownerDocument.body;
    // Before the scene goes: a batch it never settles must not hold the
    // next mission's controls (#1130).
    this.resetPlayback();
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
    if (body) {
      delete body.dataset.phasePlaying;
    }
  }

  // ===========================================
  // Rendering
  // ===========================================

  /**
   * Pushes the mission into the HUD and the scene host, with the events
   * that produced it.
   *
   * With a scene attached, the batch is **paced by the scene**: each
   * event's log line, banner and indicator land as the scene plays it,
   * and the debrief waits for the last of them. Before this the whole
   * bug phase was written to the HUD before its first frame animated,
   * so the player read the result and then watched a replay of it (the
   * Executive Director's item 7 on #1113).
   *
   * The state itself goes to the HUD at once. It is what the rules are
   * asked against, and a HUD holding the previous turn refused the
   * player's first command after the bug phase as "not your turn"
   * until the animation ran out (`tactical-spawners` caught it). What
   * is paced is the *account* of the batch, not the board.
   *
   * The controls, though, follow the account (#1130). A batch that
   * crosses a phase — an `EndTurn`, which plays the whole bug phase and
   * hands the turn back — holds them from the first event to the last:
   * End turn is disabled, clicks and action keys are dropped, and the
   * body says `data-phase-playing="true"` so a spec can wait it out.
   * Without this the "Your turn" banner was right and the controls were
   * early: the Executive Director could select and act while the bugs
   * were still walking. The player's own batches are not held — they
   * are already looking at what they did.
   *
   * A mission arriving whole, or a screen without a scene, takes the
   * batch at once as well: there is nothing to pace against, and an
   * arrival replays the mission's own log.
   */
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
    const paced =
      mission !== undefined &&
      this.deps.sceneHost !== undefined &&
      this.viewport !== undefined &&
      this.attachedMissionId === mission.missionId;
    if (!paced) {
      // Another mission, or none: whatever the last scene was playing
      // is over as far as these controls are concerned.
      this.resetPlayback();
      this.hud.update(mission, events);
      if (!mission) {
        return;
      }
      for (const event of events) {
        this.announceOne(event, mission, state);
      }
      void this.syncScene(mission, events);
      if (mission.outcome !== undefined) {
        this.finish(mission.missionId);
      }
      return;
    }
    // Held before the HUD sees the new board, so its first refresh
    // already draws End turn disabled.
    const hold = crossesPhase(events) ? this.holdPlayback() : undefined;
    this.hud.update(mission);
    void this.syncScene(mission, events, {
      onEvent: (event) => {
        hold?.progress();
        this.hud.playEvent(event, mission);
        this.announceOne(event, mission, state);
      },
      onSettled: () => {
        hold?.settled();
        if (mission.outcome !== undefined) {
          this.finish(mission.missionId);
        }
      },
      // A scene that fails mid-batch never settles; the promise still
      // resolves, and the release is idempotent.
    }).then(() => {
      hold?.settled();
    });
  }

  // ===========================================
  // Playback lock
  // ===========================================

  /**
   * Holds the controls for one paced batch (#1130) and returns what
   * releases them. Idempotent, and inert once the mission it belonged
   * to has been replaced or the screen unmounted, so a scene that never
   * settles cannot leave the next mission locked.
   */
  private beginPlayback(): () => void {
    const generation = this.playbackGeneration;
    this.playingBatches += 1;
    this.setPlaying(true);
    let released = false;
    return () => {
      if (released || generation !== this.playbackGeneration) {
        return;
      }
      released = true;
      this.playingBatches -= 1;
      if (this.playingBatches === 0) {
        this.stopWatchdog();
        this.setPlaying(false);
      }
    };
  }

  /**
   * Holds the controls for one phase-crossing batch (#1132) and returns
   * the two signals that release them. The release needs both: the
   * scene has settled, and the phase banner has stopped announcing the
   * bug phase. A bug phase with nothing to draw settles on the spot,
   * while the player is still reading "Bug phase" for its hold — and
   * End turn offered under that banner was what got pressed twice.
   *
   * ```
   *   hold ──► settled ──┬── banner past "Bug phase" ──► release
   *                      └── still announcing ──► wait for the banner
   *          idle limit with no progress, settle or banner ──► release, warn
   * ```
   */
  private holdPlayback(): { progress: () => void; settled: () => void } {
    const release = this.beginPlayback();
    let settled = false;
    const tryRelease = (): void => {
      if (!settled || this.hud.isAnnouncing("bugs")) {
        return;
      }
      this.awaitingBanner.delete(tryRelease);
      release();
    };
    this.restartWatchdog();
    return {
      progress: () => {
        this.restartWatchdog();
      },
      settled: () => {
        settled = true;
        this.awaitingBanner.add(tryRelease);
        tryRelease();
      },
    };
  }

  /**
   * Restarts the clock that frees the controls if the map goes quiet
   * (#1132): no event beginning, no settle and no banner change for
   * `idleLimitMs` means the scene has stopped, and the player must not
   * be frozen with it. Releases every held batch with a warning, which
   * is a bug report, not a rule.
   */
  private restartWatchdog(): void {
    this.stopWatchdog();
    if (this.playingBatches === 0) {
      return;
    }
    this.watchdog = this.setTimer(() => {
      this.watchdog = undefined;
      if (this.playingBatches === 0) {
        return;
      }
      console.warn(
        `Tactical playback made no progress for ${String(this.idleLimitMs)} ms; releasing the controls`,
      );
      this.resetPlayback();
    }, this.idleLimitMs);
  }

  /** Cancels the watchdog, if one is running. */
  private stopWatchdog(): void {
    if (this.watchdog !== undefined) {
      this.clearTimer(this.watchdog);
      this.watchdog = undefined;
    }
  }

  /** Forgets every playing batch: a new mission, or none, has nothing playing. */
  private resetPlayback(): void {
    this.playbackGeneration += 1;
    this.playingBatches = 0;
    this.awaitingBanner.clear();
    this.stopWatchdog();
    this.setPlaying(false);
  }

  /**
   * Pushes the lock to everything that enforces it: the HUD, which
   * disables End turn and drops intents; the scene host, which drops
   * clicks and action keys; and the body, which a spec waits on. Only
   * on a change, so a screen that never locks never touches the host.
   */
  private setPlaying(playing: boolean): void {
    if (playing === this.playing) {
      return;
    }
    this.playing = playing;
    this.hud.setPlaybackLocked(playing);
    this.deps.sceneHost?.setInputLocked(playing);
    const body = this.root?.ownerDocument.body;
    if (body) {
      body.dataset.phasePlaying = String(playing);
    }
  }

  /**
   * Puts a logged action above the unit that did it (#1029).
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
  private announceOne(
    event: TacticalEvent,
    mission: TacticalState,
    campaign: GameState | undefined,
  ): void {
    const host = this.deps.sceneHost;
    const unitId = actorOf(event);
    if (!host || unitId === undefined) {
      return;
    }
    // The campaign too, because the log resolves with it since #1047:
    // without it the indicator says "Rifle Squad" while the log line it
    // is meant to mirror says "Alpha", which is the one thing this
    // mechanism exists to prevent.
    const entry = describeEvent(event, namesFor(mission, campaign));
    if (entry !== undefined) {
      host.notice(unitId, entry.text);
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

  /**
   * Attaches the scene on the first mission, updates it afterwards;
   * never throws into the store. Resolves once the host has settled or
   * failed, either way, so a caller can release what it held.
   */
  private syncScene(
    mission: TacticalState,
    events: readonly TacticalEvent[],
    hooks?: TacticalUpdateHooks,
  ): Promise<void> {
    const host = this.deps.sceneHost;
    if (!host || !this.viewport) {
      return Promise.resolve();
    }
    const intents = {
      emit: (intent: TacticalIntent): void => {
        // Nothing of the mission's while a bug phase is still playing
        // (#1130): the board says it is the player's turn, the map does
        // not yet, and the controls follow the map. View intents pass:
        // the storey keys and Shift ask the scene, not the mission.
        if (
          this.playing &&
          intent.kind !== "layer-step" &&
          intent.kind !== "inspect"
        ) {
          return;
        }
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
        ? host.update(mission, events, hooks)
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
    return pending.catch((error: unknown) => {
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

/**
 * True when a batch carries a phase change (#1130): an `EndTurn` plays
 * the bug phase and hands the turn back in one batch, and that is the
 * batch the controls wait out. A move or a shot of the player's own is
 * not held: the player is already looking at it.
 */
function crossesPhase(events: readonly TacticalEvent[]): boolean {
  return events.some((event) => event.type === TURN_STARTED);
}

/** The tactical events in a store change; everything else is the overworld's. */
function tacticalEventsOf(
  events: readonly { readonly type: string }[],
): TacticalEvent[] {
  return events.filter((e): e is TacticalEvent =>
    e.type.startsWith("tactical:"),
  );
}

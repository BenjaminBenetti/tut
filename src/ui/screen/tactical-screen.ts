import type { Unsubscribe } from "../../core/model/event-bus";
import { CameraInputController } from "../../graphics/controller/camera-input-controller";
import { CAMERA_ZOOM } from "../../graphics/model/camera-state";
import type { ModelLoader } from "../../graphics/model/model-loader";
import type { SceneServiceOptions } from "../../graphics/service/scene-service";
import { IsometricCameraRig } from "../../graphics/service/isometric-camera-rig";
import { TacticalSceneBuilder } from "../../graphics/service/tactical-scene-builder";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { GameState } from "../../save/model/game-state";
import { TacticalInputController } from "../controller/tactical-input-controller";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import type { TacticalTestHooks } from "../model/tactical-intent";
import { TacticalHudView } from "../view/tactical-hud-view";

// ===========================================
// Types
// ===========================================

/** The running renderer the screen owns while mounted; `SceneService` satisfies it. */
export interface SceneHandle {
  /** Starts the render loop. */
  start(): void;
  /** Stops the loop and removes the canvas. */
  dispose(): void;
}

/** What the tactical screen needs from the app. */
export interface TacticalScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** Resolves unit models; the app passes its GLTF loader. */
  readonly models: ModelLoader;
  readonly combatTuning: CombatTuning;
  /** Builds the renderer into the map container; the app passes `new SceneService(...)`, tests a fake. */
  readonly createScene: (
    container: HTMLElement,
    options: SceneServiceOptions,
  ) => SceneHandle;
}

// ===========================================
// TacticalScreen
// ===========================================

/**
 * The mission screen (GDD §6): #337's scene in the map cell with #340's
 * input over it, and the HUD around it. Renders `activeMission` from the
 * campaign store; every store change re-renders the scene and the HUD,
 * and every HUD command goes through the store with refusals shown in
 * the banner. Without a mission in progress the screen shows a note and
 * a way back.
 *
 * ```
 *   ┌ #turn-banner ──────────────────────────────────────────┐
 *   │ #tactical-map (canvas)                     │ #unit-card │
 *   │                                            │ #hit-preview
 *   │                                            │ #objectives│
 *   ├ #action-bar ───────────────────────────────┴────────────┤
 *
 *   store.subscribe ──▶ builder.update(units, templates); hud.update(mission)
 *   input intents   ──▶ hud.handleIntent ──▶ onCommand ──▶ store.dispatch
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
  private builder: TacticalSceneBuilder | undefined;
  private input: TacticalInputController | undefined;
  private scene: SceneHandle | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private missionId: string | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session, models, tuning and the renderer factory. */
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
      { combatTuning: deps.combatTuning },
    );
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the layout, the scene for the active mission and the HUD, then subscribes. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-tactical";
    layout.dataset.screen = this.id;
    const mapArea = doc.createElement("div");
    mapArea.id = "tactical-map";
    mapArea.className = "tut-tactical__map";
    layout.appendChild(mapArea);
    this.hud.mount(layout);
    root.appendChild(layout);
    this.root = layout;

    const store = this.deps.session.store;
    this.render(store?.getState(), mapArea);
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state, mapArea);
    });
  }

  /** Unsubscribes and tears down the input, scene, HUD and layout. */
  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.teardownScene();
    this.hud.unmount();
    this.root?.remove();
    this.root = undefined;
  }

  // ===========================================
  // Hooks
  // ===========================================

  /** The end-to-end hooks of the live input controller, or undefined without a mission. */
  hooks(): TacticalTestHooks | undefined {
    return this.input?.hooks();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Rebuilds the scene when the mission changes, then pushes state into the scene and HUD. */
  private render(state: GameState | undefined, mapArea: HTMLElement): void {
    const mission = state?.activeMission;
    if (!mission) {
      this.teardownScene();
      this.hud.update(undefined);
      this.hud.showStatus("No mission is in progress.");
      return;
    }
    if (this.missionId !== mission.missionId || !this.builder) {
      this.teardownScene();
      this.buildScene(mission, mapArea);
    }
    this.hud.update(mission);
    void this.builder?.update(mission.units, mission.templates);
    this.builder?.setSelected(this.hud.getSelectedUnitId());
  }

  /** Builds the scene, camera, input and renderer for a mission. */
  private buildScene(mission: TacticalState, mapArea: HTMLElement): void {
    const builder = new TacticalSceneBuilder({
      map: mission.map,
      models: this.deps.models,
    });
    const rig = new IsometricCameraRig({
      target: builder.centre,
      zoom: CAMERA_ZOOM.initial,
      bounds: { x: 0, z: 0, w: mission.map.width, d: mission.map.depth },
    });
    const input = new TacticalInputController({
      picker: builder,
      camera: rig,
      cameraInput: new CameraInputController(rig),
      intents: {
        emit: (intent) => {
          this.hud.handleIntent(intent);
          builder.setSelected(this.hud.getSelectedUnitId());
        },
      },
    });
    this.scene = this.deps.createScene(mapArea, {
      camera: rig,
      content: builder.root,
      updatables: [input],
    });
    input.attach(mapArea);
    this.scene.start();
    this.builder = builder;
    this.input = input;
    this.missionId = mission.missionId;
  }

  /** Detaches input, disposes the scene and renderer. */
  private teardownScene(): void {
    this.input?.detach();
    this.input = undefined;
    this.scene?.dispose();
    this.scene = undefined;
    this.builder?.dispose();
    this.builder = undefined;
    this.missionId = undefined;
  }

  /** Runs a command through the store; a refusal lands in the banner. */
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

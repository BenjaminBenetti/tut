import { Group } from "three";

import { CameraInputController } from "../../graphics/controller/camera-input-controller";
import { MODEL_MANIFEST } from "../../graphics/data/model-manifest";
import { CAMERA_ZOOM } from "../../graphics/model/camera-state";
import type { ModelLoader } from "../../graphics/model/model-loader";
import { GltfModelLoader } from "../../graphics/service/gltf-model-loader";
import { IsometricCameraRig } from "../../graphics/service/isometric-camera-rig";
import { PlaceholderModelFactory } from "../../graphics/service/placeholder-model-factory";
import { SceneService } from "../../graphics/service/scene-service";
import { TacticalSceneBuilder } from "../../graphics/service/tactical-scene-builder";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { TacticalInputController } from "../../ui/controller/tactical-input-controller";
import type {
  TacticalIntentSink,
  TacticalTestHooks,
} from "../../ui/model/tactical-intent";
import type { TacticalSceneHost } from "../../ui/model/tactical-scene-host";

// ===========================================
// Types
// ===========================================

/** What the host needs from the environment. */
export interface DomTacticalSceneHostDeps {
  /** Loads unit models; the app passes the manifest loader, tests a stub. */
  readonly models?: ModelLoader;
  /** Receives the input controller's test hooks whenever a scene is attached; dev builds put them on `window`. */
  readonly onHooks?: (hooks: TacticalTestHooks | undefined) => void;
  /** Public base URL for the manifest loader when `models` is not given. */
  readonly baseUrl?: string;
}

/** Everything one attached scene owns, released together. */
interface AttachedScene {
  readonly builder: TacticalSceneBuilder;
  readonly input: TacticalInputController;
  readonly scene: SceneService;
}

// ===========================================
// DomTacticalSceneHost
// ===========================================

/**
 * `TacticalSceneHost` over three.js: the tactical scene builder from
 * #337, the isometric rig bounded to the map, the tactical input
 * controller from #340 owning camera input, and a `SceneService`
 * rendering into the screen's viewport. Mirrors what the map preview
 * harness composes for `?units=1`, so the Playwright tactical specs
 * find the same hooks and body attributes in the real app.
 *
 * ```
 *   attach(container, mission, intents)
 *     ├─ builder = TacticalSceneBuilder({ map, models })
 *     ├─ rig.setBounds(map) · rig.lookAt(centre)
 *     ├─ input = TacticalInputController({ picker: builder, camera: rig, cameraInput, intents })
 *     ├─ scene = SceneService(container, { camera: rig, content, updatables: [input] })
 *     └─ builder.update(units, templates) ──► body[data-tactical-units]
 * ```
 */
export class DomTacticalSceneHost implements TacticalSceneHost {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: DomTacticalSceneHostDeps;
  private readonly models: ModelLoader;
  private attached: AttachedScene | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Model loader, hook sink and base URL. */
  constructor(deps: DomTacticalSceneHostDeps = {}) {
    this.deps = deps;
    this.models =
      deps.models ??
      new GltfModelLoader({
        manifest: MODEL_MANIFEST,
        baseUrl: deps.baseUrl ?? "/",
        fallback: new PlaceholderModelFactory(),
        logger: console,
      });
  }

  // ===========================================
  // TacticalSceneHost
  // ===========================================

  /** Builds the scene, camera and input for `mission` inside `container`. */
  async attach(
    container: HTMLElement,
    mission: TacticalState,
    intents: TacticalIntentSink,
  ): Promise<void> {
    this.release();
    const builder = new TacticalSceneBuilder({
      map: mission.map,
      models: this.models,
    });
    const content = new Group();
    content.add(builder.root);
    const rig = new IsometricCameraRig({ zoom: CAMERA_ZOOM.min });
    rig.setBounds({ x: 0, z: 0, w: mission.map.width, d: mission.map.depth });
    rig.lookAt(builder.centre);
    const input = new TacticalInputController({
      picker: builder,
      camera: rig,
      cameraInput: new CameraInputController(rig),
      intents,
    });
    const scene = new SceneService(container, {
      camera: rig,
      content,
      updatables: [input],
    });
    input.attach(container);
    this.deps.onHooks?.(input.hooks());
    this.attached = { builder, input, scene };
    scene.start();
    await this.placeUnits(mission);
  }

  /** Moves the units to match `mission`. */
  async update(mission: TacticalState): Promise<void> {
    if (this.attached) {
      await this.placeUnits(mission);
    }
  }

  /** Disposes the scene, input and builder. */
  release(): void {
    const attached = this.attached;
    if (!attached) {
      return;
    }
    this.attached = undefined;
    attached.input.detach();
    attached.scene.dispose();
    attached.builder.dispose();
    this.deps.onHooks?.(undefined);
    delete document.body.dataset.tacticalUnits;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Places the mission's units and records the count on the body for tests. */
  private async placeUnits(mission: TacticalState): Promise<void> {
    const attached = this.attached;
    if (!attached) {
      return;
    }
    await attached.builder.update(mission.units, mission.templates);
    if (this.attached === attached) {
      document.body.dataset.tacticalUnits = String(
        attached.builder.unitIds().length,
      );
    }
  }
}

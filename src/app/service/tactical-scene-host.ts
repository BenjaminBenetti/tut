import { Group } from "three";

import { CameraInputController } from "../../graphics/controller/camera-input-controller";
import { MODEL_MANIFEST } from "../../graphics/data/model-manifest";
import { SPRITE_MANIFEST } from "../../graphics/data/sprite-manifest";
import { CAMERA_ZOOM } from "../../graphics/model/camera-state";
import { missionFocus } from "../../graphics/service/tactical-framing";
import type { ModelLoader } from "../../graphics/model/model-loader";
import type { SpriteSource } from "../../graphics/model/sprite-source";
import { GltfModelLoader } from "../../graphics/service/gltf-model-loader";
import { ManifestSpriteLoader } from "../../graphics/service/manifest-sprite-loader";
import { IsometricCameraRig } from "../../graphics/service/isometric-camera-rig";
import { PlaceholderModelFactory } from "../../graphics/service/placeholder-model-factory";
import { SceneService } from "../../graphics/service/scene-service";
import { TacticalAnimationQueue } from "../../graphics/service/tactical-animation-queue";
import {
  TacticalOverlays,
  overlaysFor,
} from "../../graphics/service/tactical-overlays";
import { TacticalSceneBuilder } from "../../graphics/service/tactical-scene-builder";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
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
  /** Public base URL for the manifest loaders when `models` / `sprites` are not given. */
  readonly baseUrl?: string;
  /** Loads VFX sprites; the app passes the manifest loader, tests a stub. */
  readonly sprites?: SpriteSource;
  /** Collapses every animation to its end state at once; the tactical specs turn it on. */
  readonly instantAnimations?: boolean;
}

/** Everything one attached scene owns, released together. */
interface AttachedScene {
  readonly builder: TacticalSceneBuilder;
  readonly input: TacticalInputController;
  readonly scene: SceneService;
  readonly overlays: TacticalOverlays;
  readonly animations: TacticalAnimationQueue;
  mission: TacticalState;
  selected: UnitId | undefined;
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
 *     ├─ rig.setBounds(map) · rig.lookAt(missionFocus)
 *     ├─ input = TacticalInputController({ picker: builder, camera: rig, cameraInput, intents })
 *     ├─ overlays = TacticalOverlays()  ·  animations = TacticalAnimationQueue({ scene: builder, sprites })
 *     ├─ scene = SceneService(container, { camera: rig, content, updatables: [input, animations] })
 *     └─ builder.update(units, templates)      ──► body[data-tactical-units]
 *        builder.updateSpawners(spawners)      ──► body[data-tactical-spawners]
 *   update(mission, events) ──► animations.enqueue(events, () => builder.update(...)) (#338)
 *   select(unitId)          ──► overlays.show(overlaysFor(mission, unitId))
 * ```
 */
export class DomTacticalSceneHost implements TacticalSceneHost {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: DomTacticalSceneHostDeps;
  private readonly models: ModelLoader;
  private readonly sprites: SpriteSource;
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
    this.sprites =
      deps.sprites ??
      new ManifestSpriteLoader({
        manifest: SPRITE_MANIFEST,
        baseUrl: deps.baseUrl ?? "/",
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
    const overlays = new TacticalOverlays();
    const rig = new IsometricCameraRig({ zoom: CAMERA_ZOOM.min });
    const animations = new TacticalAnimationQueue({
      scene: builder,
      sprites: this.sprites,
      // Borrowed to turn a tracer along its flight in screen space (#514).
      camera: rig.camera,
      instant: this.deps.instantAnimations ?? false,
    });
    const content = new Group();
    content.add(builder.root, overlays.root, animations.root);
    rig.setBounds({ x: 0, z: 0, w: mission.map.width, d: mission.map.depth });
    // The force the player just deployed, not the middle of the map: on
    // a large map those are tens of tiles apart and the squad opens off
    // screen (#538).
    rig.lookAt(missionFocus(mission));
    const input = new TacticalInputController({
      picker: builder,
      camera: rig,
      cameraInput: new CameraInputController(rig),
      intents,
    });
    const scene = new SceneService(container, {
      camera: rig,
      content,
      updatables: [input, animations],
    });
    input.attach(container);
    this.deps.onHooks?.(input.hooks());
    this.attached = {
      builder,
      input,
      scene,
      overlays,
      animations,
      mission,
      selected: undefined,
    };
    scene.start();
    // The map art and the unit models are independent fetches; running
    // them together keeps the first frame from waiting on both in turn.
    await Promise.all([builder.loadMapModels(), this.placeUnits(mission)]);
  }

  /** Plays `events`, then moves the units to match `mission` and refreshes the overlays. */
  update(
    mission: TacticalState,
    events: readonly TacticalEvent[] = [],
  ): Promise<void> {
    const attached = this.attached;
    if (!attached) {
      return Promise.resolve();
    }
    attached.mission = mission;
    return new Promise((resolve) => {
      attached.animations.enqueue(events, () => {
        void this.placeUnits(mission).then(() => {
          this.refreshOverlays();
          resolve();
        });
      });
    });
  }

  /** Shows range, cover and line-of-sight overlays for `unitId`, or clears them. */
  select(unitId: UnitId | undefined): void {
    if (this.attached) {
      this.attached.selected = unitId;
      this.refreshOverlays();
    }
  }

  /** Shows or hides the weapon-range outline (#522). */
  setWeaponRangeVisible(visible: boolean): void {
    this.attached?.overlays.setWeaponRangeVisible(visible);
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
    attached.animations.dispose();
    attached.overlays.dispose();
    attached.builder.dispose();
    this.deps.onHooks?.(undefined);
    delete document.body.dataset.tacticalUnits;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Recomputes the overlays for the current selection against the current mission. */
  private refreshOverlays(): void {
    const attached = this.attached;
    if (!attached) {
      return;
    }
    attached.overlays.show(overlaysFor(attached.mission, attached.selected));
    document.body.dataset.tacticalSelected = attached.selected ?? "";
  }

  /** Places the mission's units and records the count on the body for tests. */
  private async placeUnits(mission: TacticalState): Promise<void> {
    const attached = this.attached;
    if (!attached) {
      return;
    }
    // Units and spawners load in parallel: both are just models on tiles,
    // and a spawner is the mission's objective, so it should appear with
    // the force rather than after it (#484).
    await Promise.all([
      attached.builder.update(mission.units, mission.templates),
      attached.builder.updateSpawners(mission.spawners),
    ]);
    if (this.attached === attached) {
      document.body.dataset.tacticalUnits = String(
        attached.builder.unitIds().length,
      );
      document.body.dataset.tacticalSpawners = String(
        attached.builder.spawnerIds().length,
      );
    }
  }
}

import { TEXTURE_MANIFEST } from "../../graphics/data/texture-manifest";
import type { TextureSource } from "../../graphics/model/texture-source";
import { ManifestTextureLoader } from "../../graphics/service/manifest-texture-loader";
import { Group } from "three";

import { CameraInputController } from "../../graphics/controller/camera-input-controller";
import { MODEL_MANIFEST } from "../../graphics/data/model-manifest";
import { SPRITE_MANIFEST } from "../../graphics/data/sprite-manifest";
import { missionArrivalYaw } from "../../graphics/service/tactical-framing";
import { CAMERA_ZOOM } from "../../graphics/model/camera-state";
import {
  drawPerceived,
  frameMission,
  placeArrivals,
  playAroundRedraw,
} from "./tactical-scene-steps";
import type { ModelLoader } from "../../graphics/model/model-loader";
import type { SpriteSource } from "../../graphics/model/sprite-source";
import { GltfModelLoader } from "../../graphics/service/gltf-model-loader";
import { ManifestSpriteLoader } from "../../graphics/service/manifest-sprite-loader";
import { OrthographicCameraRig } from "../../graphics/service/orthographic-camera-rig";
import { unitFeetAt } from "../../graphics/service/unit-placement";
import { footprintSizeOf } from "../../tactical/service/footprint-service";
import { PlaceholderModelFactory } from "../../graphics/service/placeholder-model-factory";
import { GhostController } from "../../graphics/service/ghost-controller";
import { SceneService } from "../../graphics/service/scene-service";
import { TacticalAnimationQueue } from "../../graphics/service/tactical-animation-queue";
import {
  TacticalOverlays,
  overlaysFor,
} from "../../graphics/service/tactical-overlays";
import type { LayerFocus } from "../../graphics/model/layer-focus";
import {
  stepFocus,
  topFocus,
} from "../../graphics/service/layer-focus-service";
import { LoadoutUnitModelSource } from "../../graphics/service/loadout-unit-model-source";
import { TacticalSceneBuilder } from "../../graphics/service/tactical-scene-builder";
import { tileRiseFor } from "../../graphics/service/surface-rise";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
import { TacticalInputController } from "../../ui/controller/tactical-input-controller";
import type { Vec2 } from "../../core/model/grid";
import type {
  TacticalIntentSink,
  TacticalInvokeTarget,
  TacticalTestHooks,
} from "../../ui/model/tactical-intent";
import type {
  TacticalSceneHost,
  TacticalUpdateHooks,
} from "../../ui/model/tactical-scene-host";

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
  /** Cached business-name artwork; tests can inject an in-memory source. */
  readonly textures?: TextureSource;
  /** Collapses every animation to its end state at once; the tactical specs turn it on. */
  readonly instantAnimations?: boolean;
}

/** Everything one attached scene owns, released together. */
interface AttachedScene {
  readonly builder: TacticalSceneBuilder;
  readonly input: TacticalInputController;
  readonly scene: SceneService;
  /** The camera rig, kept so a unit can be centred on later (#1041). */
  readonly rig: OrthographicCameraRig;
  readonly overlays: TacticalOverlays;
  readonly animations: TacticalAnimationQueue;
  mission: TacticalState;
  selected: UnitId | undefined;
  /** The armed attack target, so the sight cue can narrow to it (#517). */
  target: string | undefined;
  /** Which storeys are drawn (#961); starts at the top, the uncut map. */
  layerFocus: LayerFocus;
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
  private readonly textures: TextureSource;
  private attached: AttachedScene | undefined;
  /** Whether the player's map input is held (#1130); applied to every scene attached. */
  private inputLocked = false;

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
    this.textures =
      deps.textures ??
      new ManifestTextureLoader({
        manifest: TEXTURE_MANIFEST,
        baseUrl: deps.baseUrl ?? "/",
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
      textures: this.textures,
      // A mech is drawn from the parts its loadout names (#1115).
      unitModels: new LoadoutUnitModelSource({ models: this.models }),
    });
    // Raised slabs such as sidewalks lift the marks painted on them (#1130).
    const overlays = new TacticalOverlays({ rise: tileRiseFor(mission.map) });
    // Marks on a floor the storey view has peeled away go with it (#1134);
    // the map view answers, so the two never disagree about the cut.
    overlays.setLayerCut((tile) => builder.isCut(tile));
    const rig = new OrthographicCameraRig({
      zoom: CAMERA_ZOOM.min,
      yawIndex: missionArrivalYaw(mission),
    });
    const animations = new TacticalAnimationQueue({
      scene: builder,
      sprites: this.sprites,
      // Borrowed to turn a tracer along its flight in screen space (#514).
      camera: rig.camera,
      instant: this.deps.instantAnimations ?? false,
    });
    const content = new Group();
    content.add(builder.root, overlays.root, animations.root);
    frameMission(rig, mission);
    const input = new TacticalInputController({
      picker: builder,
      camera: rig,
      cameraInput: new CameraInputController(rig),
      intents,
    });
    // Walls fade where they stand between the camera and a unit (#526).
    const ghosting = new GhostController(
      rig.camera,
      () => builder.ghostTargets(),
      builder.ghosting,
    );
    const scene = new SceneService(container, {
      camera: rig,
      content,
      // The fires flicker on the frame loop like everything else that
      // moves without a command (#1121).
      updatables: [
        input,
        animations,
        ghosting,
        builder.effectsUpdatable,
        builder.chargesUpdatable,
        builder.radarUpdatable,
        builder.turretUpdatable,
      ],
    });
    input.attach(container);
    input.setLocked(this.inputLocked);
    // The height cut is the scene's, not the input controller's, so the
    // host supplies that one hook itself (#978).
    this.deps.onHooks?.({
      ...input.hooks(),
      applyHeightCut: (level) => {
        builder.setLayerFocus(undefined);
        builder.setMaxLevel(level);
      },
    });
    this.attached = {
      rig,
      builder,
      input,
      scene,
      overlays,
      animations,
      mission,
      selected: undefined,
      target: undefined,
      layerFocus: topFocus(mission.map),
    };
    this.publishLayerFocus();
    scene.start();
    // The map art and the unit models are independent fetches; running
    // them together keeps the first frame from waiting on both in turn.
    await Promise.all([builder.loadMapModels(), this.placeUnits(mission)]);
    // Unit count is available before map art. Captures need both (#996).
    if (this.attached?.scene === scene) {
      document.body.dataset.tacticalReady = "true";
    }
  }

  /** Plays `events`, then moves the units to match `mission` and refreshes the overlays. */
  update(
    mission: TacticalState,
    events: readonly TacticalEvent[] = [],
    hooks: TacticalUpdateHooks = {},
  ): Promise<void> {
    const attached = this.attached;
    if (!attached) {
      hooks.onSettled?.();
      return Promise.resolve();
    }
    attached.mission = mission;
    // A unit that walks into view is put on the board where its walk
    // began, so the walk can play rather than the unit popping in at
    // its destination (#1116).
    return placeArrivals(attached.builder, mission, events)
      .then((arrivals) =>
        playAroundRedraw(
          attached.animations,
          events,
          () => this.placeUnits(mission),
          hooks.onEvent,
          arrivals,
        ),
      )
      .then(() => {
        this.refreshOverlays();
        hooks.onSettled?.();
      });
  }

  /**
   * Frames the wheel's tile through the overlays (#1112 follow-up), and
   * records it on the body so a spec can read which tile is framed
   * without a hook, as `tacticalSelected` does for the selection.
   */
  markTile(tile: TileCoord | undefined): void {
    this.attached?.overlays.setMarkedTile(tile);
    if (tile === undefined) {
      delete document.body.dataset.tacticalMarkedTile;
    } else {
      document.body.dataset.tacticalMarkedTile = `${String(tile.x)},${String(tile.y)},${String(tile.z)}`;
    }
  }

  /** Paints the footprint of the shot being considered, or clears it (#1121). */
  markBlast(tiles: readonly TileCoord[]): void {
    this.attached?.overlays.setBlastTiles(tiles);
    if (tiles.length === 0) {
      delete document.body.dataset.tacticalBlastTiles;
    } else {
      document.body.dataset.tacticalBlastTiles = String(tiles.length);
    }
  }

  /**
   * Paints the reach of the weapon rested on in the unit panel, or
   * clears it (#1132), and counts it on the body as the blast is, so a
   * spec can read that the preview is up without a hook.
   */
  markWeaponRange(tiles: readonly TileCoord[]): void {
    this.attached?.overlays.setWeaponRangeFill(tiles);
    if (tiles.length === 0) {
      delete document.body.dataset.tacticalRangeTiles;
    } else {
      document.body.dataset.tacticalRangeTiles = String(tiles.length);
    }
  }

  /**
   * Shows range, cover and line-of-sight overlays for `unitId`, and
   * rings the unit itself, or clears both.
   *
   * The ring was the half that never happened (#605). `UnitMesh` has
   * built one since #471 and the builder has implemented `setSelected`
   * all along, but the only caller was `mapgen-preview.ts` -- so the
   * ring worked in the dev harness and had never been drawn in a real
   * mission. Hover was wired and selection was not, which is backwards:
   * a unit merely pointed at rang, and the one actually being commanded
   * did not.
   *
   * @param unitId - The selected unit.
   * @param targetId - The armed target, when one is chosen; it narrows
   *   the sight cue to that target rather than to any enemy (#517).
   */
  select(unitId: UnitId | undefined, targetId?: string): void {
    if (this.attached) {
      this.attached.selected = unitId;
      this.attached.target = targetId;
      this.attached.builder.setSelected(unitId);
      this.refreshOverlays();
    }
  }

  /** Raises the words above the unit through the animation queue (#1030). */
  notice(unitId: UnitId, text: string): void {
    this.attached?.animations.notice(unitId, text);
  }

  /** Shows or hides the weapon-range outline (#522). */
  setWeaponRangeVisible(visible: boolean): void {
    this.attached?.overlays.setWeaponRangeVisible(visible);
  }

  /** Holds or releases the player's map input, and remembers it for the next scene (#1130). */
  setInputLocked(locked: boolean): void {
    this.inputLocked = locked;
    this.attached?.input.setLocked(locked);
  }

  /** Disposes the scene, input and builder. */
  /**
   * Where a world thing appears on screen, delegated to the input
   * controller, which owns the camera and the picker (ADR 0007 §2.1).
   *
   * @param target - The unit, spawner or tile to project.
   * @returns Client pixels, or undefined when it is not drawn — which is
   *   what closes an anchored menu whose target has died or gone unseen.
   */
  screenPositionOf(target: TacticalInvokeTarget): Vec2 | undefined {
    const input = this.attached?.input;
    if (!input) {
      return undefined;
    }
    switch (target.kind) {
      case "unit":
        return input.unitScreenPosition(target.unitId);
      case "spawner":
        return input.spawnerScreenPosition(target.spawnerId);
      case "tile":
        return input.tileScreenPosition(target.tile);
    }
  }

  /** The top of a unit's model on screen, through the input controller's projection. */
  unitHeadScreenPosition(unitId: UnitId): Vec2 | undefined {
    return this.attached?.input.unitHeadScreenPosition(unitId);
  }

  /** Centres the camera on a unit through the rig's existing `lookAt` (#1041). */
  lookAtUnit(unitId: UnitId): void {
    const attached = this.attached;
    const unit = attached?.mission.units.find(
      (candidate) => candidate.id === unitId,
    );
    if (!attached || !unit) {
      return;
    }
    // The middle of the unit's footprint, not its anchor tile (#1130).
    attached.rig.lookAt(
      unitFeetAt(
        unit.pos,
        footprintSizeOf(attached.mission.templates[unit.templateId] ?? {}),
      ),
    );
  }

  /**
   * Moves the view `delta` storeys and returns where it landed (#961).
   *
   * Clamped at both ends by `stepFocus`, so holding a key at the top or
   * bottom of a building does nothing rather than wrapping to the other
   * end — the player is pressing without looking.
   *
   * @param delta - Storeys to move; `+1` is up.
   * @returns The focus after the step, or undefined with no scene.
   */
  stepLayerFocus(delta: number): LayerFocus | undefined {
    const attached = this.attached;
    if (!attached) {
      return undefined;
    }
    attached.layerFocus = stepFocus(
      attached.mission.map,
      attached.layerFocus,
      delta,
    );
    attached.builder.setLayerFocus(attached.layerFocus);
    attached.overlays.setLayerCut((tile) => attached.builder.isCut(tile));
    this.publishLayerFocus();
    return attached.layerFocus;
  }

  /** Where the view is now, or undefined when no scene is attached. */
  layerFocus(): LayerFocus | undefined {
    return this.attached?.layerFocus;
  }

  /** Tears the scene down. Safe to call when not attached. */
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
    delete document.body.dataset.tacticalRadars;
    delete document.body.dataset.tacticalRadarContacts;
    delete document.body.dataset.tacticalReady;
    delete document.body.dataset.tacticalStorey;
    delete document.body.dataset.tacticalStoreys;
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
    const state = overlaysFor(
      attached.mission,
      attached.selected,
      attached.target,
    );
    attached.overlays.show(state);
    attached.builder.setMovementTiles(state.moveRange.map(({ tile }) => tile));
    document.body.dataset.tacticalSelected = attached.selected ?? "";
  }

  /**
   * Records the focus on the body so an end-to-end test can read which
   * storey is drawn without a hook. One-based, as the floors are shown
   * to the player; the top value is the roofed view, which the banner
   * labels "All" rather than numbering (#1136).
   */
  private publishLayerFocus(): void {
    const focus = this.attached?.layerFocus;
    if (!focus) {
      return;
    }
    document.body.dataset.tacticalStorey = String(focus.storey + 1);
    document.body.dataset.tacticalStoreys = String(focus.storeyCount);
  }

  /** Places the mission's units and records the count on the body for tests. */
  private async placeUnits(mission: TacticalState): Promise<void> {
    const attached = this.attached;
    if (!attached) {
      return;
    }
    await drawPerceived(attached.builder, mission);
    if (this.attached === attached) {
      const radar = attached.builder.radarCounts();
      document.body.dataset.tacticalRadars = String(radar.scanners);
      document.body.dataset.tacticalRadarContacts = String(radar.contacts);
      document.body.dataset.tacticalUnits = String(
        attached.builder.unitIds().length,
      );
      document.body.dataset.tacticalSpawners = String(
        attached.builder.spawnerIds().length,
      );
      document.body.dataset.tacticalEffects = String(
        attached.builder.effectIds().length,
      );
      document.body.dataset.tacticalCharges = String(
        attached.builder.chargeIds().length,
      );
    }
  }
}

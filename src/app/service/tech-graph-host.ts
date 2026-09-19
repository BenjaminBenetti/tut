import { Vector3 } from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import { CameraInputController } from "../../graphics/controller/camera-input-controller";
import { PickingController } from "../../graphics/controller/picking-controller";
import { MODEL_MANIFEST } from "../../graphics/data/model-manifest";
import type { FrameUpdatable } from "../../graphics/model/frame-updatable";
import type { ModelLoader } from "../../graphics/model/model-loader";
import {
  groundScreenAxes,
  projectionOf,
} from "../../graphics/service/camera-math";
import { GltfModelLoader } from "../../graphics/service/gltf-model-loader";
import { OrthographicCameraRig } from "../../graphics/service/orthographic-camera-rig";
import { PlaceholderModelFactory } from "../../graphics/service/placeholder-model-factory";
import { SceneService } from "../../graphics/service/scene-service";
import {
  PEDESTAL_RADIUS,
  PLINTH_RADIUS,
  TechGraphSceneBuilder,
} from "../../graphics/service/tech-graph-scene-builder";
import type { TechNodeId } from "../../tech/model/tech-node";
import type { TechNodeStatus } from "../../tech/service/tech-status-service";
import type {
  TechGraphAnchor,
  TechGraphHost,
  TechGraphListener,
} from "../../ui/model/tech-graph-host";
import type { TechGraphLayout } from "../../ui/model/tech-graph-layout";
import type { TutTechHooks } from "../model/test-hooks";

// ===========================================
// Types
// ===========================================

/** What the host needs from the environment. */
export interface DomTechGraphHostDeps {
  /** Loads part models; the app passes the manifest loader, tests a stub. */
  readonly models?: ModelLoader;
  /** Public base URL for the manifest loader when `models` is not given. */
  readonly baseUrl?: string;
  /**
   * Receives the test hooks when a graph is attached and `undefined`
   * when it is released; the bootstrap hangs them on `window` in a
   * dev build.
   */
  readonly onHooks?: (hooks: TutTechHooks | undefined) => void;
}

/** Everything one attachment owns. */
interface Attached {
  readonly container: HTMLElement;
  readonly layout: TechGraphLayout;
  readonly listener: TechGraphListener;
  readonly rig: OrthographicCameraRig;
  readonly builder: TechGraphSceneBuilder;
  readonly cameraInput: CameraInputController;
  readonly picking: PickingController<TechNodeId>;
  readonly scene: SceneService;
}

// ===========================================
// Constants
// ===========================================

/**
 * Starting zoom, in pixels per world unit: the tier 2 ring fills a
 * laptop window's width with the tier 3 ring just past its edge, so
 * the first thing seen is the shape of the whole web and the first
 * thing to do is pan or zoom into a family.
 */
const INITIAL_ZOOM = 48;

/** World units of relief the zoom range allows for: the tallest model on its pedestal. */
const GRAPH_HEIGHT = 3;

// ===========================================
// DomTechGraphHost
// ===========================================

/**
 * `TechGraphHost` over three.js: the shared orthographic rig and the
 * same camera input as the tactical map (pan, zoom, rotate), picking
 * on the pedestals, and `SceneService` for the frame loop.
 *
 * ```
 *   attach(container, layout)
 *     ├─ builder = TechGraphSceneBuilder(layout)   pedestals, plinths, beams
 *     ├─ rig: target = core, bounds = the graph, zoom range fits it
 *     ├─ input: CameraInputController(rig) on the canvas, keys on the document
 *     ├─ picking: PickingController(builder, rig) → listener.picked
 *     └─ scene = SceneService(container, { rig, builder.root, [input, turntables, anchors] })
 *
 *   each frame: input pans ──► rig.apply() ──► anchors projected ──► listener.framed
 * ```
 *
 * The anchors are re-projected only when the camera state or the
 * canvas size changed, so a still scene writes nothing to the DOM.
 */
export class DomTechGraphHost implements TechGraphHost {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: DomTechGraphHostDeps;
  private readonly models: ModelLoader;
  private attached: Attached | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Model loader, base URL and the hook sink. */
  constructor(deps: DomTechGraphHostDeps = {}) {
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
  // TechGraphHost
  // ===========================================

  /** Builds the scene for `layout` inside `container`, releasing any earlier one. */
  attach(
    container: HTMLElement,
    layout: TechGraphLayout,
    listener: TechGraphListener,
  ): void {
    this.release();
    const builder = new TechGraphSceneBuilder({
      layout,
      models: this.models,
    });
    const rig = new OrthographicCameraRig({
      zoom: INITIAL_ZOOM,
      target: { x: 0, y: 0, z: 0 },
      // The target stays on the graph, so a held pan key can never carry
      // the web off screen.
      bounds: {
        x: -layout.radius,
        z: -layout.radius,
        w: layout.radius * 2,
        d: layout.radius * 2,
      },
    });
    rig.setMapExtent({
      width: layout.radius * 2,
      depth: layout.radius * 2,
      height: GRAPH_HEIGHT,
    });
    const cameraInput = new CameraInputController(rig);
    const picking = new PickingController<TechNodeId>(builder, rig, {
      onSelected: (id) => {
        listener.picked(id);
      },
      onMissed: () => {
        listener.picked(undefined);
      },
    });
    const scene = new SceneService(container, {
      camera: rig,
      content: builder.root,
      updatables: [
        cameraInput,
        builder.turntables,
        this.createAnchorUpdatable(),
      ],
    });
    // The canvas, not the container: the labels float over the canvas
    // and a wheel or a click on a label's button must not reach the
    // camera or the picker.
    const canvas =
      container.querySelector<HTMLCanvasElement>(":scope > canvas");
    const surface = canvas ?? container;
    cameraInput.attach(surface);
    picking.attach(surface);
    this.attached = {
      container,
      layout,
      listener,
      rig,
      builder,
      cameraInput,
      picking,
      scene,
    };
    scene.start();
    this.deps.onHooks?.(this.createHooks());
    void builder.loadModels().then(() => {
      if (this.attached?.builder === builder) {
        container.dataset.techModelsReady = "true";
      }
    });
  }

  /** Retints the pedestals and links. */
  setStatuses(statuses: ReadonlyMap<TechNodeId, TechNodeStatus>): void {
    this.attached?.builder.setStatuses(statuses);
  }

  /** Lights the selected pedestal. */
  setSelected(nodeId: TechNodeId | undefined): void {
    this.attached?.builder.setSelected(nodeId);
  }

  /** Pans the camera onto `nodeId`. */
  focus(nodeId: TechNodeId): void {
    const attached = this.attached;
    const world = attached?.builder.worldPosition(nodeId);
    if (!attached || !world) {
      return;
    }
    attached.rig.lookAt(world);
  }

  /** Tears the scene down. Safe to call when not attached. */
  release(): void {
    const attached = this.attached;
    if (!attached) {
      return;
    }
    this.attached = undefined;
    attached.cameraInput.detach();
    attached.picking.detach();
    attached.scene.dispose();
    attached.builder.dispose();
    delete attached.container.dataset.techModelsReady;
    this.deps.onHooks?.(undefined);
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Projects every pedestal and plinth to the screen after the camera
   * moved, and tells the listener. Runs after the input updatable, so
   * the rig is applied here first and the labels land on this frame's
   * camera rather than last frame's.
   */
  private createAnchorUpdatable(): FrameUpdatable {
    let lastState: unknown;
    let lastWidth = -1;
    let lastHeight = -1;
    return {
      update: () => {
        const attached = this.attached;
        if (!attached) {
          return;
        }
        const state = attached.rig.getState();
        const width = attached.container.clientWidth;
        const height = attached.container.clientHeight;
        if (
          state === lastState &&
          width === lastWidth &&
          height === lastHeight
        ) {
          return;
        }
        lastState = state;
        lastWidth = width;
        lastHeight = height;
        attached.rig.apply();
        // Labels hang off the near edge of a pedestal: the ground point
        // one radius towards the camera, which is one radius against
        // screen-up on the ground.
        const up = groundScreenAxes(state.yawIndex, projectionOf(state)).up;
        const nearEdge = (at: Vec3, radius: number): Vec3 => ({
          x: at.x - up.x * radius,
          y: 0,
          z: at.z - up.z * radius,
        });
        const nodes: TechGraphAnchor[] = [];
        for (const node of attached.layout.nodes) {
          const world = attached.builder.worldPosition(node.id);
          if (world) {
            nodes.push({
              id: node.id,
              ...this.project(
                attached,
                nearEdge(world, PEDESTAL_RADIUS),
                width,
                height,
              ),
            });
          }
        }
        const families: TechGraphAnchor[] = [];
        for (const family of attached.layout.families) {
          const world = attached.builder.familyPosition(family.id);
          if (world) {
            families.push({
              id: family.id,
              ...this.project(
                attached,
                nearEdge(world, PLINTH_RADIUS),
                width,
                height,
              ),
            });
          }
        }
        attached.listener.framed({ nodes, families, zoom: state.zoom });
      },
    };
  }

  /** A world point in CSS pixels from the container's top-left. */
  private project(
    attached: Attached,
    world: Vec3,
    width: number,
    height: number,
  ): Vec2 {
    const ndc = new Vector3(world.x, world.y, world.z).project(
      attached.rig.camera,
    );
    return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
  }

  /** The dev build's hooks over this attachment. */
  private createHooks(): TutTechHooks {
    return {
      nodeScreenPosition: (nodeId) => {
        const attached = this.attached;
        const world = attached?.builder.worldPosition(nodeId);
        if (!attached || !world) {
          return undefined;
        }
        attached.rig.apply();
        return this.project(
          attached,
          { x: world.x, y: 0.6, z: world.z },
          attached.container.clientWidth,
          attached.container.clientHeight,
        );
      },
      select: (nodeId) => {
        this.attached?.picking.select(nodeId);
      },
      focus: (nodeId) => {
        this.focus(nodeId);
      },
      zoom: () => this.attached?.rig.getState().zoom ?? 0,
    };
  }
}

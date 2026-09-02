import type { Object3D } from "three";
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Scene,
  WebGLRenderer,
} from "three";

import type { FrameUpdatable } from "../model/frame-updatable";
import type { SceneCamera } from "../model/scene-camera";

// ===========================================
// Types
// ===========================================

/** What the scene service is composed from. */
export interface SceneServiceOptions {
  /** Owner of the camera the scene renders through. */
  readonly camera: SceneCamera;
  /** Content added to the scene; the service does not build any of its own. */
  readonly content?: Object3D;
  /** Ticked in order every frame, before the camera is applied and the scene drawn. */
  readonly updatables?: readonly FrameUpdatable[];
}

// ===========================================
// Constants
// ===========================================

/** Canvas clear colour: `ui-bg` from the style guide. */
const CLEAR_COLOUR = 0x0b0d12;

/** Longest frame delta handed to updatables, so a background tab cannot cause a jump. */
const MAX_FRAME_SECONDS = 0.1;

/**
 * Owns the three.js renderer lifecycle: canvas creation, lights, resize
 * handling and the render loop. Content and camera are injected.
 *
 * ```
 *   every frame:  updatables[i].update(dt) ──▶ camera.apply() ──▶ render
 * ```
 */
export class SceneService {
  // ===========================================
  // Fields
  // ===========================================

  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly sceneCamera: SceneCamera;
  private readonly updatables: readonly FrameUpdatable[];
  private readonly firstFrame: Promise<void>;
  private resolveFirstFrame: (() => void) | undefined;
  private lastFrameTimeMs: number | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Creates the renderer and scene graph, and attaches the canvas
   * to the given container element.
   *
   * @param container - DOM element the WebGL canvas is appended to.
   * @param options - Camera, content and per-frame subscribers.
   */
  constructor(container: HTMLElement, options: SceneServiceOptions) {
    this.sceneCamera = options.camera;
    this.updatables = options.updatables ?? [];

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.scene.background = new Color(CLEAR_COLOUR);
    for (const light of this.createLights()) {
      this.scene.add(light);
    }
    if (options.content) {
      this.scene.add(options.content);
    }

    this.firstFrame = new Promise<void>((resolve) => {
      this.resolveFirstFrame = resolve;
    });

    this.applySize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", this.handleResize);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Starts the render loop. Safe to call once after construction.
   */
  start(): void {
    this.renderer.setAnimationLoop(this.renderFrame);
  }

  /**
   * Resolves once the first frame has been rendered, so callers can
   * signal readiness to the page (and to end-to-end tests).
   */
  whenFirstFrameRendered(): Promise<void> {
    return this.firstFrame;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Builds the fixed lighting from the style guide: one key directional
   * light and a soft ambient. The key comes from +x +y +z, off-axis from
   * every yaw so the two visible faces of a box shade differently.
   *
   * @returns The lights to add to the scene.
   */
  private createLights(): Object3D[] {
    const key = new DirectionalLight(0xffffff, 2.5);
    key.position.set(4, 8, 12);
    const ambient = new AmbientLight(0xffffff, 0.8);
    return [key, ambient];
  }

  /**
   * Sizes the canvas and tells the camera owner about the new viewport.
   */
  private applySize(widthPx: number, heightPx: number): void {
    this.renderer.setSize(widthPx, heightPx);
    this.sceneCamera.resize(widthPx, heightPx);
  }

  /**
   * Renders one frame: ticks the updatables with a clamped delta, syncs
   * the camera, draws, and resolves the first-frame promise once.
   */
  private readonly renderFrame = (timeMs: number): void => {
    const deltaSeconds =
      this.lastFrameTimeMs === undefined
        ? 0
        : Math.min((timeMs - this.lastFrameTimeMs) / 1000, MAX_FRAME_SECONDS);
    this.lastFrameTimeMs = timeMs;

    for (const updatable of this.updatables) {
      updatable.update(deltaSeconds);
    }
    this.sceneCamera.apply();
    this.renderer.render(this.scene, this.sceneCamera.camera);

    this.resolveFirstFrame?.();
    this.resolveFirstFrame = undefined;
  };

  /**
   * Keeps the camera and renderer in sync with the window size.
   */
  private readonly handleResize = (): void => {
    this.applySize(window.innerWidth, window.innerHeight);
  };
}

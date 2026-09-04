import type { DirectionalLight } from "three";
import type { Object3D } from "three";
import { AmbientLight, Color, Scene, PCFShadowMap, WebGLRenderer } from "three";

import type { FrameUpdatable } from "../model/frame-updatable";
import type { SceneCamera } from "../model/scene-camera";
import { createKeyLight, followCamera, SHADOW_TUNING } from "./shadow-rig";
import type { Viewport } from "./isometric-camera-math";

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
 * Owns the three.js renderer lifecycle: canvas creation, lights, sizing
 * to its container and the render loop. Content and camera are injected.
 * The canvas fills whatever element it is mounted in and follows that
 * element's size, so a screen can give the map a viewport region.
 *
 * ```
 *   every frame:  updatables[i].update(dt) ──▶ camera.apply() ──▶ render
 * ```
 */
export class SceneService {
  // ===========================================
  // Fields
  // ===========================================

  private readonly container: HTMLElement;
  private readonly renderer: WebGLRenderer;
  /** The shadow-casting key light, retargeted every frame (#507). */
  private key: DirectionalLight | undefined;
  private readonly scene: Scene;
  private readonly sceneCamera: SceneCamera;
  private readonly updatables: readonly FrameUpdatable[];
  private readonly resizeObserver: ResizeObserver;
  private readonly firstFrame: Promise<void>;
  private resolveFirstFrame: (() => void) | undefined;
  private lastFrameTimeMs: number | undefined;
  /** Bumped every time a size is applied; see `onSettled`. */
  private sizeGeneration = 0;
  /** The generation the last rendered frame was drawn at. */
  private renderedGeneration = -1;
  /** The size the camera was last built for, to compare against the container. */
  private appliedViewport: Viewport = { width: 0, height: 0 };
  private readonly settledListeners = new Set<() => void>();

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Creates the renderer and scene graph, and attaches the canvas
   * to the given container element.
   *
   * @param container - DOM element the WebGL canvas is appended to and sized to.
   * @param options - Camera, content and per-frame subscribers.
   */
  constructor(container: HTMLElement, options: SceneServiceOptions) {
    this.container = container;
    this.sceneCamera = options.camera;
    this.updatables = options.updatables ?? [];

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    // Cast shadows, so height reads (#507).
    //
    // `PCFShadowMap`, and not `PCFSoftShadowMap`, because three r185
    // deprecated the latter: it silently falls back to exactly this and
    // warns once per scene. Asking for it did not make the filter soft,
    // it only made the code disagree with what was running -- and the
    // e2e log carried two warnings a session saying so.
    //
    // If the softer edge is wanted back, `VSMShadowMap` is the option
    // three still offers, and it is a real change with artefacts of its
    // own rather than a one-word swap. Worth noting for whoever weighs
    // that: the 2048 map that timed the suite out was measured running
    // *this* filter, since the soft one was never in play.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
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

    this.applySize(this.measure());
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(container);
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

  /**
   * Runs `listener` the next time a frame is rendered at a viewport size
   * that has stopped changing — and immediately if that is already true.
   *
   * ```
   *   appendChild ──▶ layout ──▶ ResizeObserver ──▶ applySize ──▶ render
   *   ^ container size known here          camera matches it only here
   * ```
   *
   * "A frame has been rendered" is not the same fact and is the one
   * that misleads: the canvas moves between containers (#160), so after
   * an `attach` the next frames are still drawn on the *previous*
   * container's frustum until the observer fires. Anything projecting a
   * world position in that window gets a confident wrong answer — a
   * 78 px shift on the overworld, which #451 read as sixteen cities
   * standing in the ocean (#473).
   *
   * @param listener - Called once, when the viewport is settled.
   * @returns Unsubscribes, for a listener that is no longer wanted.
   */
  onSettled(listener: () => void): () => void {
    if (this.isSettled()) {
      listener();
      return () => undefined;
    }
    this.settledListeners.add(listener);
    return () => this.settledListeners.delete(listener);
  }

  /**
   * Stops the loop, stops watching the container and removes the canvas.
   * Scene content is left to its owner to dispose.
   */
  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.settledListeners.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Builds the fixed lighting from the style guide: one key directional
   * light and a soft ambient. The key comes from +x +y +z, off-axis from
   * every yaw so the two visible faces of a box shade differently, and
   * since #507 it casts shadows and the fill is lower to let them read.
   *
   * @returns The lights to add to the scene.
   */
  private createLights(): Object3D[] {
    const key = createKeyLight();
    this.key = key;
    const ambient = new AmbientLight(0xffffff, SHADOW_TUNING.ambientIntensity);
    // The target is a separate object three reads the light's direction
    // from, so it has to be in the scene for `followCamera` to move it.
    return [key, key.target, ambient];
  }

  /**
   * The container's current size in CSS pixels, falling back to the
   * window when the container has not been laid out yet.
   *
   * @returns Width and height to render at.
   */
  private measure(): Viewport {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width > 0 && height > 0) {
      return { width, height };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  }

  /**
   * Sizes the canvas and tells the camera owner about the new viewport.
   */
  private applySize(viewport: Viewport): void {
    this.renderer.setSize(viewport.width, viewport.height);
    this.sceneCamera.resize(viewport.width, viewport.height);
    this.appliedViewport = viewport;
    this.sizeGeneration += 1;
  }

  /**
   * Whether the camera both matches the container as it is right now and
   * has drawn a frame that way.
   *
   * Measuring here rather than trusting the last resize is the whole
   * point: the observer fires a task or more after the element moves, so
   * between `appendChild` and that callback the camera is stale while
   * every counter says it is current. Reading `clientWidth` forces the
   * layout the observer is waiting for, so the mismatch is visible
   * immediately instead of one frame late.
   */
  private isSettled(): boolean {
    if (this.renderedGeneration !== this.sizeGeneration) {
      return false;
    }
    const now = this.measure();
    return (
      now.width === this.appliedViewport.width &&
      now.height === this.appliedViewport.height
    );
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
    if (this.key) {
      // After `apply`, so the frustum follows where the camera ended up
      // this frame rather than where it was last one.
      followCamera(this.key, this.sceneCamera.camera);
    }
    this.renderer.render(this.scene, this.sceneCamera.camera);

    this.resolveFirstFrame?.();
    this.resolveFirstFrame = undefined;

    // Recorded after the draw, so a listener woken here is reading a
    // camera that has already produced a frame at this size.
    this.renderedGeneration = this.sizeGeneration;
    if (this.settledListeners.size > 0 && this.isSettled()) {
      // Copied, because a listener may unsubscribe itself or another.
      for (const listener of [...this.settledListeners]) {
        this.settledListeners.delete(listener);
        listener();
      }
    }
  };

  /**
   * Keeps the canvas and camera in step with the container's size.
   */
  private readonly handleResize = (): void => {
    this.applySize(this.measure());
  };
}

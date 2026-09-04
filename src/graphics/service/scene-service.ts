import type { Object3D } from "three";
import {
  AmbientLight,
  Color,
  DirectionalLight,
  PCFShadowMap,
  Scene,
  WebGLRenderer,
} from "three";

import {
  FILL_LIGHT_INTENSITY,
  FILL_LIGHT_INTENSITY_UNSHADOWED,
  KEY_LIGHT_COLOUR,
  KEY_LIGHT_INTENSITY,
  KEY_LIGHT_INTENSITY_UNSHADOWED,
  KEY_LIGHT_POSITION,
  SHADOW_BIAS,
  SHADOW_CAMERA_FAR,
  SHADOW_CAMERA_NEAR,
  SHADOW_FRUSTUM_HALF_EXTENT,
  SHADOW_MAP_SIZE,
  SHADOW_NORMAL_BIAS,
} from "../data/tactical-lighting";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { SceneCamera } from "../model/scene-camera";
import type { Viewport } from "./isometric-camera-math";
import { ShadowFollowController } from "./shadow-follow-controller";

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
  /**
   * Whether the key light casts shadows (#507). Off by default: the
   * overworld is a globe lit for legibility, and only the tactical
   * scene has ground for things to sit on.
   */
  readonly shadows?: boolean;
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
  private readonly scene: Scene;
  private readonly sceneCamera: SceneCamera;
  private updatables: readonly FrameUpdatable[];
  private readonly resizeObserver: ResizeObserver;
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
   * @param container - DOM element the WebGL canvas is appended to and sized to.
   * @param options - Camera, content and per-frame subscribers.
   */
  constructor(container: HTMLElement, options: SceneServiceOptions) {
    this.container = container;
    this.sceneCamera = options.camera;
    this.updatables = options.updatables ?? [];

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    if (options.shadows === true) {
      this.renderer.shadowMap.enabled = true;
      // Not PCFSoftShadowMap: three r185 deprecates it and silently
      // falls back to this, warning once per scene.
      this.renderer.shadowMap.type = PCFShadowMap;
    }
    container.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.scene.background = new Color(CLEAR_COLOUR);
    const key = this.createKeyLight(options.shadows === true);
    this.scene.add(key, key.target, this.createFillLight(options.shadows === true));
    if (options.shadows === true) {
      // Prepended, so the frustum is over the right ground before
      // anything else this frame reads the scene.
      this.updatables = [
        new ShadowFollowController(key, this.sceneCamera.camera),
        ...this.updatables,
      ];
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
   * Stops the loop, stops watching the container and removes the canvas.
   * Scene content is left to its owner to dispose.
   */
  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * The key directional light from the style guide (§12.1). It comes
   * from +x +y +z, off-axis from every yaw so the two visible faces of a
   * box shade differently.
   *
   * @param shadows - Whether it casts; a caster is also brighter, since
   *   a shadowed surface keeps only the fill.
   * @returns The key light, its target not yet placed.
   */
  private createKeyLight(shadows: boolean): DirectionalLight {
    const key = new DirectionalLight(
      KEY_LIGHT_COLOUR,
      shadows ? KEY_LIGHT_INTENSITY : KEY_LIGHT_INTENSITY_UNSHADOWED,
    );
    key.position.set(
      KEY_LIGHT_POSITION.x,
      KEY_LIGHT_POSITION.y,
      KEY_LIGHT_POSITION.z,
    );
    if (!shadows) {
      return key;
    }
    key.castShadow = true;
    key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    const camera = key.shadow.camera;
    camera.left = -SHADOW_FRUSTUM_HALF_EXTENT;
    camera.right = SHADOW_FRUSTUM_HALF_EXTENT;
    camera.top = SHADOW_FRUSTUM_HALF_EXTENT;
    camera.bottom = -SHADOW_FRUSTUM_HALF_EXTENT;
    camera.near = SHADOW_CAMERA_NEAR;
    camera.far = SHADOW_CAMERA_FAR;
    camera.updateProjectionMatrix();
    key.shadow.bias = SHADOW_BIAS;
    key.shadow.normalBias = SHADOW_NORMAL_BIAS;
    return key;
  }

  /**
   * The soft fill. Dropped when the key casts, because at full strength
   * it washes every shadow into a grey smudge (§12.1).
   *
   * @param shadows - Whether the key casts.
   * @returns The fill light.
   */
  private createFillLight(shadows: boolean): Object3D {
    return new AmbientLight(
      KEY_LIGHT_COLOUR,
      shadows ? FILL_LIGHT_INTENSITY : FILL_LIGHT_INTENSITY_UNSHADOWED,
    );
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
   * Keeps the canvas and camera in step with the container's size.
   */
  private readonly handleResize = (): void => {
    this.applySize(this.measure());
  };
}

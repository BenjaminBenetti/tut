import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Mesh, Object3D } from "three";

// ===========================================
// Constants
// ===========================================

/**
 * Canvas clear colour: `ui-bg`, the clear colour §12.1 fixes for every
 * three.js view. The same mech stands on the same ground in the bay as
 * in the field, and the panel around it supplies the frame.
 */
const CLEAR_COLOUR = 0x0b0d12;

/** Key light, from §12.1's no-shadow pair: the mech bay is not a mission. */
const KEY_INTENSITY = 2.5;

/** Ambient fill, §12.1. Kept at 0.8 because nothing here casts. */
const AMBIENT_INTENSITY = 0.8;

/** Key light position, §12.1 — off-axis from every yaw stop so faces shade apart. */
const KEY_POSITION: readonly [number, number, number] = [4, 8, 12];

/** Yaw the mech is shown from: the game's default stop, so the bay matches the field. */
const VIEW_YAW = Math.PI / 4;

/** True isometric elevation, as the tactical camera uses. */
const VIEW_ELEVATION = Math.atan(Math.SQRT1_2);

/** Distance the camera sits at. Orthographic, so this only has to clear the model. */
const VIEW_DISTANCE = 20;

/** Fraction of the viewport the model's bounding box is allowed to fill. */
const FRAME_FILL = 0.82;

/** Half-extent used when a model has no size yet, so the frustum is never zero. */
const MIN_HALF_EXTENT = 0.5;

// ===========================================
// MechPreviewScene
// ===========================================

/**
 * A small three.js scene showing one assembled mech: orthographic
 * camera at the game's default yaw, the §12.1 key and fill, no shadows
 * and no input. The mech bay is not a mission, so this does not borrow
 * the tactical rig — it renders **on demand**, once per swap and once
 * per resize, rather than running an animation loop behind a static
 * picture for as long as the screen is open.
 *
 * ```
 *   show(object) ──► clear content ──► add ──► frame() ──► render()
 *   resize       ──►         size canvas ──► frame() ──► render()
 * ```
 */
export class MechPreviewScene {
  // ===========================================
  // Fields
  // ===========================================

  private readonly container: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: OrthographicCamera;
  private readonly content = new Group();
  private readonly resizeObserver: ResizeObserver | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** Creates the renderer, lights and camera, and mounts the canvas in `container`. */
  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.scene.background = new Color(CLEAR_COLOUR);
    const key = new DirectionalLight(0xffffff, KEY_INTENSITY);
    key.position.set(...KEY_POSITION);
    this.scene.add(key, new AmbientLight(0xffffff, AMBIENT_INTENSITY));
    this.scene.add(this.content);

    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    // ResizeObserver is missing in jsdom, where the mech bay's own specs
    // mount this through a stub; the preview simply never re-frames.
    this.resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            this.draw();
          });
    this.resizeObserver?.observe(container);
    this.draw();
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Replaces whatever is shown with `object`, reframes and redraws.
   *
   * @param object - The assembled mech, or undefined to show nothing.
   */
  show(object: Object3D | undefined): void {
    this.content.clear();
    if (object) {
      this.content.add(object);
    }
    this.draw();
  }

  /** Disposes the renderer and removes the canvas. Safe to call twice. */
  release(): void {
    this.resizeObserver?.disconnect();
    this.content.clear();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Sizes the canvas to its container, frames the content and renders one frame. */
  private draw(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) {
      return;
    }
    this.renderer.setSize(width, height, false);
    this.frame();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Points the camera at the content and sizes the frustum to hold it.
   *
   * The extents come from **every vertex, projected into camera space**,
   * not from the model's bounding box. Framing on a box is the trap the
   * 48 px part thumbnails are still in (#694): their helper uses the
   * box's *diagonal*, which over-pads anything elongated. Using the
   * box's corners instead is better and still wrong — under an
   * isometric tilt a box projects to a hexagon whose extreme corners
   * are empty air above and below a tall, thin mech. Measured, that
   * cost 21 points of fill: the box projected to 82 % of the view, as
   * asked, while the mech inside it reached 61 %.
   *
   * Projecting the vertices measures the silhouette itself, so the
   * number in `FRAME_FILL` is the number on the screen whatever shape
   * the loadout is.
   */
  private frame(): void {
    const box = new Box3().setFromObject(this.content);
    const centre = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3());

    const horizontal = Math.cos(VIEW_ELEVATION) * VIEW_DISTANCE;
    this.camera.position.set(
      centre.x + Math.sin(VIEW_YAW) * horizontal,
      centre.y + Math.sin(VIEW_ELEVATION) * VIEW_DISTANCE,
      centre.z + Math.cos(VIEW_YAW) * horizontal,
    );
    this.camera.lookAt(centre);
    this.camera.updateMatrixWorld();

    const bounds = this.silhouette();
    // Centre the frustum on the silhouette rather than on the camera
    // axis: an orthographic frustum is offset in camera space, so the
    // mech is centred without moving the camera and re-projecting.
    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;
    let halfWidth = Math.max(MIN_HALF_EXTENT, (bounds.maxX - bounds.minX) / 2);
    let halfHeight = Math.max(MIN_HALF_EXTENT, (bounds.maxY - bounds.minY) / 2);

    halfWidth /= FRAME_FILL;
    halfHeight /= FRAME_FILL;
    // Grow whichever half-extent the canvas aspect leaves slack in, so
    // the model fills `FRAME_FILL` of the tighter axis either way.
    const aspect = this.container.clientWidth / this.container.clientHeight;
    if (halfWidth / halfHeight < aspect) {
      halfWidth = halfHeight * aspect;
    } else {
      halfHeight = halfWidth / aspect;
    }

    this.camera.left = midX - halfWidth;
    this.camera.right = midX + halfWidth;
    this.camera.top = midY + halfHeight;
    this.camera.bottom = midY - halfHeight;
    this.camera.near = 0.1;
    this.camera.far = VIEW_DISTANCE * 3;
    this.camera.updateProjectionMatrix();
  }

  /**
   * The content's extents in camera space, from its mesh vertices.
   *
   * @returns Min and max on the camera's x (screen right) and y (screen up).
   */
  private silhouette(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    // three refreshes world matrices at render time, and this runs
    // before the render that would.
    this.content.updateWorldMatrix(false, true);
    const bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    };
    const vertex = new Vector3();
    this.content.traverseVisible((node) => {
      const position = (node as Partial<Mesh>).geometry?.attributes.position;
      if (!position) {
        return;
      }
      for (let i = 0; i < position.count; i += 1) {
        vertex
          .fromBufferAttribute(position, i)
          .applyMatrix4(node.matrixWorld)
          .applyMatrix4(this.camera.matrixWorldInverse);
        bounds.minX = Math.min(bounds.minX, vertex.x);
        bounds.maxX = Math.max(bounds.maxX, vertex.x);
        bounds.minY = Math.min(bounds.minY, vertex.y);
        bounds.maxY = Math.max(bounds.maxY, vertex.y);
      }
    });
    return Number.isFinite(bounds.minX)
      ? bounds
      : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
}

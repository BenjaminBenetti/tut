import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";

/**
 * Owns the three.js scene lifecycle: renderer setup, a placeholder
 * spinning cube, resize handling, and the render loop.
 */
export class SceneService {
  // ===========================================
  // Fields
  // ===========================================

  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly cube: Mesh;
  private readonly firstFrame: Promise<void>;
  private resolveFirstFrame: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Creates the renderer and scene graph, and attaches the canvas
   * to the given container element.
   *
   * @param container - DOM element the WebGL canvas is appended to.
   */
  constructor(container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.scene.background = new Color(0x0b0d12);

    this.camera = new PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.z = 3;

    this.cube = this.createPlaceholderCube();
    this.scene.add(this.cube);
    this.scene.add(this.createLight());

    this.firstFrame = new Promise<void>((resolve) => {
      this.resolveFirstFrame = resolve;
    });

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
   * Builds the placeholder cube mesh shown until real content exists.
   *
   * @returns The cube mesh.
   */
  private createPlaceholderCube(): Mesh {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial({ color: 0x4f8ef7 });
    return new Mesh(geometry, material);
  }

  /**
   * Builds the key light for the scene.
   *
   * @returns A directional light aimed at the origin.
   */
  private createLight(): DirectionalLight {
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(2, 3, 4);
    return light;
  }

  /**
   * Renders a single animation frame, advancing the cube rotation.
   */
  private readonly renderFrame = (): void => {
    this.cube.rotation.x += 0.01;
    this.cube.rotation.y += 0.015;
    this.renderer.render(this.scene, this.camera);
    this.resolveFirstFrame?.();
    this.resolveFirstFrame = undefined;
  };

  /**
   * Keeps the camera and renderer in sync with the window size.
   */
  private readonly handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}

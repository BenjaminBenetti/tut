import { Matrix4, Vector3 } from "three";
import type { Camera } from "three";
import type { Vec2 } from "../../core/model/grid";
import { POINTER_CUTAWAY_TUNING } from "../data/pointer-cutaway";
import type { FrameUpdatable } from "../model/frame-updatable";
import type {
  PointerCutawayPicker,
  PointerCutawayTarget,
  PointerCutawayTuning,
} from "../model/pointer-cutaway";
import type { GhostUniforms } from "../service/ghost-cutaway";
import { pointerToNdc } from "../service/pointer-ndc";

/** Canvas observation only: HUD and action input stay outside this controller. */
type PointerSurface = Pick<
  HTMLCanvasElement,
  | "addEventListener"
  | "removeEventListener"
  | "getBoundingClientRect"
  | "ownerDocument"
>;

/**
 * Opens a separate pointer source after a short building dwell. Raycasts
 * only when pointer/camera/map geometry changes; a stationary inspection
 * updates one strength uniform without scanning the map again.
 */
export class PointerCutawayController implements FrameUpdatable {
  // ===========================================
  // Fields
  // ===========================================

  private surface: PointerSurface | undefined;
  private pointer: Vec2 | undefined;
  private dirty = false;
  private dragging = false;
  private target: PointerCutawayTarget | undefined;
  private shown: PointerCutawayTarget | undefined;
  private dwell = 0;
  private revision = -1;
  private readonly cameraWorld = new Matrix4();
  private readonly projection = new Matrix4();
  private readonly scratch = new Vector3();

  // ===========================================
  // Public Methods
  // ===========================================

  /** Composes the visible map picker, live camera and shared shader block. */
  constructor(
    private readonly picker: PointerCutawayPicker,
    private readonly camera: Camera,
    private readonly uniforms: GhostUniforms,
    private readonly tuning: PointerCutawayTuning = POINTER_CUTAWAY_TUNING,
  ) {
    uniforms.uPointerRadius.value = tuning.radius;
  }

  /** Observe the actual canvas so moving onto HUD panels closes inspection. */
  attach(surface: PointerSurface): void {
    this.detach();
    this.surface = surface;
    surface.addEventListener("pointermove", this.move);
    surface.addEventListener("pointerleave", this.leave);
    surface.addEventListener("pointerdown", this.down);
    surface.ownerDocument.addEventListener("pointerup", this.up);
    surface.ownerDocument.defaultView?.addEventListener("blur", this.leave);
  }

  /** Release every listener and source when the mission leaves the screen. */
  detach(): void {
    const surface = this.surface;
    if (surface) {
      surface.removeEventListener("pointermove", this.move);
      surface.removeEventListener("pointerleave", this.leave);
      surface.removeEventListener("pointerdown", this.down);
      surface.ownerDocument.removeEventListener("pointerup", this.up);
      surface.ownerDocument.defaultView?.removeEventListener(
        "blur",
        this.leave,
      );
    }
    this.surface = undefined;
    this.pointer = undefined;
    this.target = undefined;
    this.shown = undefined;
    this.dwell = 0;
    this.dragging = false;
    this.uniforms.uPointerStrength.value = 0;
  }

  /** Pick a changed ray, then advance dwell and opacity with frame time. */
  update(deltaSeconds: number): void {
    let beganDwell = false;
    this.camera.updateMatrixWorld();
    const changed =
      !this.cameraWorld.equals(this.camera.matrixWorld) ||
      !this.projection.equals(this.camera.projectionMatrix) ||
      this.revision !== this.picker.cutawayRevision;
    if (this.dirty || changed) {
      const next =
        this.pointer && !this.dragging
          ? this.picker.pickCutaway(this.pointer, this.camera)
          : undefined;
      if (next?.buildingId !== this.target?.buildingId) {
        this.dwell = 0;
        beganDwell = true;
      }
      this.target = next;
      this.cameraWorld.copy(this.camera.matrixWorld);
      this.projection.copy(this.camera.projectionMatrix);
      this.revision = this.picker.cutawayRevision;
      this.dirty = false;
    }
    if (this.target) {
      // The elapsed frame preceded this pick; do not count it as hover time.
      if (!beganDwell) this.dwell += deltaSeconds;
      // Close at the old building before moving an open source elsewhere.
      if (
        this.shown?.buildingId === this.target.buildingId ||
        this.uniforms.uPointerStrength.value === 0
      )
        this.shown = this.target;
    }
    if (this.shown) {
      const p = this.shown.centre;
      this.scratch
        .set(p.x, p.y, p.z)
        .applyMatrix4(this.camera.matrixWorldInverse);
      this.uniforms.uPointerCentre.value.copy(this.scratch);
    }
    const wanted =
      this.target &&
      this.target.buildingId === this.shown?.buildingId &&
      this.dwell >= this.tuning.dwellSeconds
        ? 1
        : 0;
    const current = this.uniforms.uPointerStrength.value;
    const step = deltaSeconds / this.tuning.fadeSeconds;
    this.uniforms.uPointerStrength.value = Math.max(
      0,
      Math.min(
        1,
        current +
          Math.sign(wanted - current) *
            Math.min(step, Math.abs(wanted - current)),
      ),
    );
  }

  // ===========================================
  // Pointer Events
  // ===========================================

  /** Keep raw canvas coordinates; no tile snapping or additional spatial lag. */
  private readonly move = (event: PointerEvent): void => {
    if (!this.surface || event.pointerType === "touch") return;
    this.pointer = pointerToNdc(
      this.surface.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );
    this.dragging = event.buttons !== 0;
    this.dirty = true;
  };

  /** Leaving the canvas or losing focus lets the current source close. */
  private readonly leave = (): void => {
    this.pointer = undefined;
    this.dirty = true;
  };

  /** Suppress inspection while any mouse button is held for camera/action input. */
  private readonly down = (): void => {
    this.dragging = true;
    this.dirty = true;
  };

  /** Re-enter dwell after a release, including one delivered outside the canvas. */
  private readonly up = (): void => {
    this.dragging = false;
    this.dirty = true;
  };
}

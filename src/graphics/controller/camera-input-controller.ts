import type { CameraControls } from "../model/camera-controls";
import type { FrameUpdatable } from "../model/frame-updatable";

// ===========================================
// Types
// ===========================================

/**
 * The DOM surface the controller listens on. Wheel events are taken from
 * the element itself; key events from its document, so the canvas needs
 * no focus. `HTMLElement` satisfies this directly.
 */
export type CameraInputSurface = Pick<
  HTMLElement,
  "addEventListener" | "removeEventListener" | "ownerDocument"
>;

type PanDirection = "left" | "right" | "up" | "down";

type KeyBinding =
  | { readonly kind: "rotate"; readonly turn: "left" | "right" }
  | { readonly kind: "pan"; readonly direction: PanDirection };

// ===========================================
// Constants
// ===========================================

/** Tuning for keyboard and wheel input. */
export const CAMERA_INPUT_TUNING = {
  /** Keyboard pan speed in screen pixels per second, while a key is held. */
  panSpeedPxPerSecond: 600,
  /**
   * How far a single press moves the view, in screen pixels. Held keys
   * pan continuously from `update`, but a press and release inside one
   * frame never reaches it, so a tapped arrow key would do nothing at
   * all — which is how QA found the camera unrecoverable (#538).
   */
  tapPanPx: 96,
  /** Zoom factor per wheel pixel: `factor = exp(-deltaPx × sensitivity)`. */
  wheelZoomSensitivity: 0.0015,
  /** Wheel deltas are clamped to this many pixels per event to tame fast trackpads. */
  maxWheelDeltaPx: 120,
} as const;

/** `WheelEvent.deltaMode` values; the globals are absent outside a browser. */
const DELTA_MODE_LINE = 1;
const DELTA_MODE_PAGE = 2;
const PIXELS_PER_LINE = 16;
const PIXELS_PER_PAGE = 400;

/**
 * Keys by their lower-cased `KeyboardEvent.key`.
 *
 * ```
 *        Q  W  E          Q / E  rotate left / right
 *        A  S  D          W A S D  pan (arrows too)
 *       wheel             zoom
 * ```
 */
const KEY_BINDINGS: Readonly<Record<string, KeyBinding>> = {
  q: { kind: "rotate", turn: "left" },
  e: { kind: "rotate", turn: "right" },
  w: { kind: "pan", direction: "up" },
  a: { kind: "pan", direction: "left" },
  s: { kind: "pan", direction: "down" },
  d: { kind: "pan", direction: "right" },
  arrowup: { kind: "pan", direction: "up" },
  arrowleft: { kind: "pan", direction: "left" },
  arrowdown: { kind: "pan", direction: "down" },
  arrowright: { kind: "pan", direction: "right" },
};

const TEXT_ENTRY_TAGS: ReadonlySet<string> = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
]);

// ===========================================
// Options
// ===========================================

/** Which camera controls this input drives. */
export interface CameraInputOptions {
  /**
   * Whether Q / E rotate the camera. The strategic map fixes north up
   * (#420), so it passes `false` and keeps only pan and zoom.
   */
  readonly rotate?: boolean;
}

// ===========================================
// Controller
// ===========================================

/**
 * Translates DOM input into camera commands: Q / E rotate (unless the
 * owner turned rotation off), the wheel zooms, W A S D or the arrow keys pan. Panning is continuous while a
 * key is held, so the owner ticks `update` once per frame.
 */
export class CameraInputController implements FrameUpdatable {
  // ===========================================
  // Fields
  // ===========================================

  private readonly controls: CameraControls;
  private readonly rotatable: boolean;
  private readonly heldPan = new Set<PanDirection>();
  private surface: CameraInputSurface | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param controls - The camera to drive; usually the isometric rig.
   * @param options - Which controls are live; all of them by default.
   */
  constructor(controls: CameraControls, options: CameraInputOptions = {}) {
    this.controls = controls;
    this.rotatable = options.rotate ?? true;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Starts listening. Attaching while attached detaches first, so a
   * controller is never bound to two surfaces at once.
   */
  attach(surface: CameraInputSurface): void {
    if (this.surface) {
      this.detach();
    }
    this.surface = surface;
    surface.addEventListener("wheel", this.handleWheel, { passive: false });
    surface.ownerDocument.addEventListener("keydown", this.handleKeyDown);
    surface.ownerDocument.addEventListener("keyup", this.handleKeyUp);
    surface.ownerDocument.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
  }

  /** Stops listening and removes every listener added by `attach`. */
  detach(): void {
    const surface = this.surface;
    if (!surface) {
      return;
    }
    surface.removeEventListener("wheel", this.handleWheel);
    surface.ownerDocument.removeEventListener("keydown", this.handleKeyDown);
    surface.ownerDocument.removeEventListener("keyup", this.handleKeyUp);
    surface.ownerDocument.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.heldPan.clear();
    this.surface = undefined;
  }

  /** True while listeners are registered. */
  isAttached(): boolean {
    return this.surface !== undefined;
  }

  /**
   * Applies held pan keys for `deltaSeconds`. Diagonals are normalised so
   * holding two keys is no faster than holding one.
   */
  update(deltaSeconds: number): void {
    if (this.heldPan.size === 0 || deltaSeconds <= 0) {
      return;
    }
    let dx = 0;
    let dy = 0;
    if (this.heldPan.has("left")) dx -= 1;
    if (this.heldPan.has("right")) dx += 1;
    if (this.heldPan.has("up")) dy -= 1;
    if (this.heldPan.has("down")) dy += 1;
    if (dx === 0 && dy === 0) {
      return;
    }
    const step =
      (CAMERA_INPUT_TUNING.panSpeedPxPerSecond * deltaSeconds) /
      Math.hypot(dx, dy);
    this.controls.panBy(dx * step, dy * step);
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Rotates on the first press of Q / E and records held pan keys.
   * Key auto-repeat is ignored so a held Q does not spin the view.
   */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isTextEntryTarget(event.target)) {
      return;
    }
    const binding = KEY_BINDINGS[event.key.toLowerCase()];
    if (!binding) {
      return;
    }
    event.preventDefault();
    if (binding.kind === "pan") {
      if (!event.repeat) {
        // A tap must move the view. Auto-repeat is left to `update`, so
        // holding the key does not stack a nudge per repeat on top of
        // the continuous pan.
        this.tapPan(binding.direction);
      }
      this.heldPan.add(binding.direction);
    } else if (!event.repeat && this.rotatable) {
      if (binding.turn === "left") {
        this.controls.rotateLeft();
      } else {
        this.controls.rotateRight();
      }
    }
  };

  /** Moves the view one press-worth in a direction. */
  private tapPan(direction: PanDirection): void {
    const step = CAMERA_INPUT_TUNING.tapPanPx;
    const dx = direction === "left" ? -step : direction === "right" ? step : 0;
    const dy = direction === "up" ? -step : direction === "down" ? step : 0;
    this.controls.panBy(dx, dy);
  }

  /** Releases a held pan key. */
  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const binding = KEY_BINDINGS[event.key.toLowerCase()];
    if (binding?.kind === "pan") {
      this.heldPan.delete(binding.direction);
    }
  };

  /** Zooms in on wheel-up and out on wheel-down, scaled by the delta. */
  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const delta = clamp(
      wheelDeltaPixels(event),
      -CAMERA_INPUT_TUNING.maxWheelDeltaPx,
      CAMERA_INPUT_TUNING.maxWheelDeltaPx,
    );
    if (delta === 0) {
      return;
    }
    this.controls.zoomBy(
      Math.exp(-delta * CAMERA_INPUT_TUNING.wheelZoomSensitivity),
    );
  };

  /** Drops held keys when the page is hidden, since their key-up may never arrive. */
  private readonly handleVisibilityChange = (): void => {
    this.heldPan.clear();
  };
}

// ===========================================
// Helpers
// ===========================================

/** Normalises a wheel delta to pixels regardless of `deltaMode`. */
function wheelDeltaPixels(event: WheelEvent): number {
  switch (event.deltaMode) {
    case DELTA_MODE_LINE:
      return event.deltaY * PIXELS_PER_LINE;
    case DELTA_MODE_PAGE:
      return event.deltaY * PIXELS_PER_PAGE;
    default:
      return event.deltaY;
  }
}

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * True when the event originated in a text-entry element, so typing in
 * a form field never moves the camera.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as Partial<
    Pick<HTMLElement, "tagName" | "isContentEditable">
  > | null;
  if (!element) {
    return false;
  }
  return (
    (element.tagName !== undefined && TEXT_ENTRY_TAGS.has(element.tagName)) ||
    element.isContentEditable === true
  );
}

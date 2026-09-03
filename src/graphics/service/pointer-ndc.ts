import type { Vec2 } from "../../core/model/grid";

// ===========================================
// Types
// ===========================================

/** The part of a `DOMRect` the conversions need. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

// ===========================================
// Conversions
// ===========================================

/**
 * Converts a pointer position in client pixels to normalised device
 * coordinates relative to an element: `x` and `y` in `[-1, 1]`, `+y`
 * up, as `Raycaster.setFromCamera` expects.
 *
 * ```
 *   client (px, +y down)          NDC (+y up)
 *   ┌────────────────┐            (-1, 1) ┌──────┐ (1, 1)
 *   │ rect           │      ⟹            │  ·   │
 *   └────────────────┘           (-1,-1) └──────┘ (1,-1)
 * ```
 */
export function pointerToNdc(
  rect: ScreenRect,
  clientX: number,
  clientY: number,
): Vec2 {
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: 1 - ((clientY - rect.top) / rect.height) * 2,
  };
}

/** Inverse of `pointerToNdc`: normalised device coordinates to client pixels. */
export function ndcToPointer(rect: ScreenRect, ndc: Vec2): Vec2 {
  return {
    x: rect.left + ((ndc.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - ndc.y) / 2) * rect.height,
  };
}

import type { Camera } from "three";

/**
 * What the render loop needs from whoever owns the camera: the three
 * camera to render with, the viewport size, and a sync step run once per
 * frame before rendering.
 */
export interface SceneCamera {
  /** The three camera to render with. Only the owner writes to it, in `apply`. */
  readonly camera: Camera;
  /** Records the render surface size in CSS pixels. */
  resize(widthPx: number, heightPx: number): void;
  /** Pushes the owner's state into the three camera. */
  apply(): void;
}

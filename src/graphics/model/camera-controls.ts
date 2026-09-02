/**
 * The mutations an input device may request of the camera. Input
 * controllers depend on this, not on the three.js rig, so they can be
 * driven by a fake in tests and reused if the rig implementation changes.
 */
export interface CameraControls {
  /** Turns the view one 90° step anticlockwise as seen from above. */
  rotateLeft(): void;
  /** Turns the view one 90° step clockwise as seen from above. */
  rotateRight(): void;
  /** Multiplies the zoom by `factor` (above 1 zooms in); the rig clamps it. */
  zoomBy(factor: number): void;
  /** Moves the view by a screen-space delta in pixels; +y is down. */
  panBy(screenDx: number, screenDy: number): void;
}

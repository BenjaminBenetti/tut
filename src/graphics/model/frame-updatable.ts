/** Something advanced once per rendered frame with the elapsed time. */
export interface FrameUpdatable {
  /**
   * Advances by `deltaSeconds`. The loop clamps large deltas, so a
   * background tab does not produce one enormous step on return.
   */
  update(deltaSeconds: number): void;
}

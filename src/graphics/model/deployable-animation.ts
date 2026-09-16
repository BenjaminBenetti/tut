import type { SprayPuffOptions } from "./spray-puff-options";

// ===========================================
// Deployable animation
// ===========================================

/**
 * How an installation's `animated` node idles on the strategic map
 * (#1155). One record per deployable type lives in
 * `graphics/data/deployable-animations.ts`; the installation marker
 * reads the kind and drives `rotation.y` from it every frame, so a new
 * type needs a data entry and no new branch.
 *
 * ```
 *   spin   ──▶ rotation.y = rate · t                    (a dish turning)
 *   sweep  ──▶ rotation.y = arc · sin(rate · t)         (barrels traversing)
 *              └─ spray?: puffs drift out of the nozzle while it sweeps
 * ```
 */
export type DeployableAnimation = SpinAnimation | SweepAnimation;

/** Turns continuously about the vertical axis. */
export interface SpinAnimation {
  readonly kind: "spin";
  /** Radians per second. Positive turns anticlockwise seen from above. */
  readonly radiansPerSecond: number;
}

/** Yaws back and forth about its rest, on a sine. */
export interface SweepAnimation {
  readonly kind: "sweep";
  /** Radians either side of the rest position. Positive. */
  readonly arc: number;
  /** Radians per second of the sine's phase: `2π / rate` seconds per full back-and-forth. */
  readonly phaseRate: number;
  /** When set, a spray of puffs drifts out of the moving node's front while it sweeps. */
  readonly spray?: SprayPuffOptions;
}

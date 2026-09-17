import type { DeployableTypeId } from "../../overworld/model/deployable-type";
import type { DeployableAnimation } from "../model/deployable-animation";
import type { SprayPuffOptions } from "../model/spray-puff-options";

// ===========================================
// Spray
// ===========================================

/**
 * The repellent dispersal's spray (#1155): a few tiny pale puffs
 * drifting a short way out of the nozzle. `ui-info` tinted so it reads
 * as vapour against the near-black ground rather than as smoke, and
 * kept under half a footprint so it never reaches a neighbour.
 */
export const REPELLENT_SPRAY: SprayPuffOptions = {
  puffs: 4,
  colour: 0x9fdcff,
  baseScale: 0.05,
  growth: 0.09,
  mouth: { forward: 0.12, height: 0.16 },
  reach: 0.22,
  period: 1.6,
  peakOpacity: 0.55,
};

// ===========================================
// Per-type idle animations
// ===========================================

/**
 * How each installation idles on the map (#1155). Slow on purpose: the
 * map is a thing to read, and a dish that turns once every twelve
 * seconds says "working" without pulling the eye from the infestation.
 *
 * ```
 *   defensive-battery    barrels traverse ±30° over 10 s
 *   repellent-dispersal  nozzle sweeps ±40° over 8 s, spraying
 *   sensor-array         dish turns once every 12 s
 *   bank                 sign turns once every 20 s
 * ```
 */
export const DEPLOYABLE_ANIMATIONS: Readonly<
  Record<DeployableTypeId, DeployableAnimation>
> = {
  "defensive-battery": {
    kind: "sweep",
    arc: Math.PI / 6,
    phaseRate: (2 * Math.PI) / 10,
  },
  "repellent-dispersal": {
    kind: "sweep",
    arc: (Math.PI * 2) / 9,
    phaseRate: (2 * Math.PI) / 8,
    spray: REPELLENT_SPRAY,
  },
  "sensor-array": {
    kind: "spin",
    radiansPerSecond: (2 * Math.PI) / 12,
  },
  bank: {
    kind: "spin",
    radiansPerSecond: (2 * Math.PI) / 20,
  },
};

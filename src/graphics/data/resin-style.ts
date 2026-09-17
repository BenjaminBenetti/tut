import type { ResinStyle } from "../model/resin-style";

/** Ground stays ankle-low; dense late-stage volume grows onto existing walls and props. */
export const RESIN_STYLE: ResinStyle = {
  minimumPatchSize: 0.55,
  maximumGroundHeight: 0.16,
  groundLift: 0.006,
  wallsFromLevel: 3,
  propsFromLevel: 5,
};

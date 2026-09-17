import type { ResinStyle } from "../model/resin-style";

/** Ground stays ankle-low; dense late-stage volume grows onto existing walls and props. */
export const RESIN_STYLE: ResinStyle = {
  patternSize: 6,
  fringeInset: 0.1,
  fringeTaper: 0.16,
  maximumGroundHeight: 0.18,
  groundLift: 0.006,
  wallsFromLevel: 3,
  propsFromLevel: 5,
};

/** Adjacent tile offsets, clockwise from north; the mask is shared with the resolver. */
export const RESIN_NEIGHBOURS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;

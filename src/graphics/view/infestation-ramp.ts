import { MAX_INFESTATION, MIN_INFESTATION } from "../../overworld/model/city";

// ===========================================
// Colour ramp
// ===========================================

/** One stop on the infestation ramp: normalised position and colour. */
export interface RampStop {
  /** Position in `[0, 1]`; stops are listed in ascending order. */
  readonly at: number;
  readonly hex: number;
}

/**
 * Infestation ramp from the Art Director (#74): `ui-ok` (clean) through
 * `ui-bug` (infested) and `ui-warn` to `ui-danger` (overrun), evenly
 * spaced.
 *
 * It lives on its own because two things now read infestation on the
 * strategic map: a city's marker (#74) and its region's wash (#440).
 * One ramp keeps a region and the cities inside it the same colour.
 */
export const INFESTATION_RAMP: readonly RampStop[] = [
  { at: 0, hex: 0x7ccb5a },
  { at: 1 / 3, hex: 0x9cff3d },
  { at: 2 / 3, hex: 0xf0c63c },
  { at: 1, hex: 0xe0453c },
];

// ===========================================
// Sampling
// ===========================================

/**
 * Maps infestation `0–100` to a colour on the ramp, as a `0xRRGGBB`
 * number. Channels are interpolated linearly in sRGB between the two
 * nearest stops; values outside the range clamp to the nearest end and a
 * non-number counts as clean.
 *
 * @param infestation - Infestation level, normally `0–100`.
 * @returns The ramp colour as `0xRRGGBB`.
 */
export function infestationColour(infestation: number): number {
  const t = infestationFraction(infestation);
  const [first] = INFESTATION_RAMP;
  if (!first) {
    return 0;
  }
  let lower = first;
  let upper = first;
  for (const stop of INFESTATION_RAMP) {
    if (stop.at <= t) {
      lower = stop;
    }
    upper = stop;
    if (stop.at >= t) {
      break;
    }
  }
  const width = upper.at - lower.at;
  const local = width > 0 ? (t - lower.at) / width : 0;
  const channel = (shift: number): number => {
    const a = (lower.hex >> shift) & 0xff;
    const b = (upper.hex >> shift) & 0xff;
    return Math.round(a + (b - a) * local);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * Infestation as a fraction of the scale in `[0, 1]`: what the ramp and
 * anything else that scales with infestation both sample.
 *
 * @param infestation - Infestation level, normally `0–100`.
 * @returns The clamped fraction; a non-number counts as clean.
 */
export function infestationFraction(infestation: number): number {
  const span = MAX_INFESTATION - MIN_INFESTATION;
  const raw = (infestation - MIN_INFESTATION) / span;
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
}

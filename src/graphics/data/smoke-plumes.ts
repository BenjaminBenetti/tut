import type { SmokePlumeOptions } from "../model/smoke-plume-options";

// ===========================================
// Presets
// ===========================================

/**
 * The plume off a burnt-out radar dish (#1130). Mid grey rather than
 * soot: on the dark ground of a night map a black puff at half opacity
 * vanished (measured on #1130's first frame, A/B against opaque
 * magenta), and the plume has to read from the default zoom, where the
 * whole scanner is thirty pixels tall. Born just over the dish, which
 * stands 0.96 tall.
 */
export const RADAR_SMOKE: SmokePlumeOptions = {
  puffs: 5,
  colour: 0x6b6b6b,
  baseScale: 0.45,
  growth: 0.65,
  startHeight: 0.8,
  rise: 1.4,
  period: 2.4,
  peakOpacity: 0.85,
  drift: 0.08,
};

/**
 * The plume off a burning tile (#1132). A shade darker than the radar's
 * and a little bigger — a fire makes more smoke than a shorted battery —
 * but no darker than reads on dark ground, which is what the radar's
 * grey was measured for. Born just over the flames (the core tongue is
 * 0.7 tall), and on a slower, taller loop so it hangs over the fire.
 */
export const FIRE_SMOKE: SmokePlumeOptions = {
  puffs: 6,
  colour: 0x5a5a5a,
  baseScale: 0.55,
  growth: 0.8,
  startHeight: 0.6,
  rise: 1.7,
  period: 2.8,
  peakOpacity: 0.8,
  drift: 0.12,
};

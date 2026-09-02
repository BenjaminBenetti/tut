import type { MapLayout } from "../model/map-layout";

// ===========================================
// Equirectangular projection
// ===========================================

/**
 * Projects a geographic coordinate onto normalised map space with a plain
 * equirectangular projection: longitude maps linearly to `x`, latitude
 * linearly to `y` with north at the top.
 *
 * ```
 *   lon  -180 ─────────────── +180        x  0 ──────────── 1
 *   lat  +90 ┐                            y  0 ┐
 *            │        · London                 │  · (0.50, 0.21)
 *            │                 · Nairobi       │           · (0.60, 0.51)
 *        -90 ┘                              1 ┘
 * ```
 *
 * Throws when the coordinate is off the globe so a typo in seed data
 * fails at load instead of drawing off-screen.
 */
export function projectEquirectangular(
  latitude: number,
  longitude: number,
): MapLayout {
  const onGlobe =
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  if (!onGlobe) {
    throw new Error(
      `Coordinate (${latitude}, ${longitude}) is outside latitude ±90 / longitude ±180`,
    );
  }
  return { x: (longitude + 180) / 360, y: (90 - latitude) / 180 };
}

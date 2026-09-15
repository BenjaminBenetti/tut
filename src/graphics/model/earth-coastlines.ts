// ===========================================
// Earth coastlines
// ===========================================

/** A geographic point as `[longitude, latitude]` in degrees. */
export type GeoPoint = readonly [longitude: number, latitude: number];

/** A closed ring of geographic points: the first point is repeated last. */
export type GeoRing = readonly GeoPoint[];

/**
 * One land mass: its outer coastline plus any inland seas cut out of
 * it. Rings are closed, so a point-in-polygon test works on them as
 * they are.
 */
export interface LandPolygon {
  readonly outer: GeoRing;
  readonly holes: readonly GeoRing[];
}

/**
 * The vector coastline set the strategic map is drawn from: every land
 * mass on Earth as closed rings in degrees, ready for the same
 * equirectangular projection the cities go through, so continents and
 * markers agree by construction.
 *
 * ```
 *   lon −180 ─────────────────────── +180
 *   lat +90 ┌───────────────────────────┐
 *           │  ╭──╮   ╭────────╮        │   each ring: [lon, lat]…
 *           │  ╰─╮╰──╮╰──╮  ╭──╯        │   closed, outer + holes
 *   −90     └───────────────────────────┘
 * ```
 */
export interface EarthCoastlines {
  /** Where the rings came from, for the reader and the rebuild script. */
  readonly source: string;
  /** Douglas–Peucker tolerance the rings were simplified with, in degrees. */
  readonly toleranceDeg: number;
  readonly polygons: readonly LandPolygon[];
}

import type { CityId } from "../../overworld/model/city";
import type { MapLayout } from "../../overworld/model/map-layout";

// ===========================================
// Marker nudges
// ===========================================

/**
 * Per-city corrections applied to a city marker's position on the
 * strategic map, in normalised layout units (#439).
 *
 * A city's `layout` is its true latitude and longitude through a plain
 * equirectangular projection, and the slab's texture is mapped to match
 * it exactly. The shipped Earth texture, though, is a *drawing*
 * (`docs/design/textures/earth-map.md`: generated from a prompt), and
 * its coastlines are approximate. Eleven mostly coastal cities — New
 * York, Tokyo, Sydney, Auckland and the rest below — therefore projected
 * onto pixels the drawing paints as sea, so their markers floated in
 * open water.
 *
 * The fix corrects the picture, not the data: latitude and longitude
 * stay authoritative, and presentation nudges the marker onto the
 * coastline the player can actually see, by the smallest offset that
 * reaches land. Every value below is under 3.5 % of the map, and
 * `city-marker-nudges.test.ts` samples the texture to prove that every
 * city — nudged or not — lands on something that is not ocean.
 *
 * ```
 *   layout (true lat/lon) ──► + nudge ──► marker on the drawn coastline
 * ```
 *
 * **When the Earth texture is redrawn, regenerate this table.** With a
 * true equirectangular map every entry becomes zero and the file can go;
 * the test tells you which cities still need one.
 */
export const CITY_MARKER_NUDGES: Readonly<Record<CityId, MapLayout>> = {
  // Offsets measured against `overworld.earth-map` at 2048 × 1024, as
  // "nearest land pixel plus three, in the same direction".
  "new-york": { x: +0.00195, y: +0.0 }, // +4, +0 px
  "mexico-city": { x: -0.00244, y: -0.00391 }, // −5, −4 px
  "sao-paulo": { x: -0.00732, y: -0.00195 }, // −15, −2 px
  paris: { x: +0.00244, y: +0.00488 }, // +5, +5 px
  johannesburg: { x: -0.00195, y: +0.00293 }, // −4, +3 px
  seoul: { x: +0.00391, y: +0.0 }, // +8, +0 px
  tokyo: { x: -0.00391, y: -0.01367 }, // −8, −14 px
  singapore: { x: +0.01025, y: -0.00879 }, // +21, −9 px
  jakarta: { x: -0.00049, y: +0.00391 }, // −1, +4 px
  sydney: { x: +0.00439, y: -0.00781 }, // +9, −8 px
  auckland: { x: -0.01367, y: -0.03223 }, // −28, −33 px
};

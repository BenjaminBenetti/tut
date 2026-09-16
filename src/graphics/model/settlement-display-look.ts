/**
 * How the strategic map restyles its settlement models to belong to the
 * WarGames display (#1155): the tones every authored material is mapped
 * to, and how the wire edges fade with the camera's zoom.
 *
 * ```
 *   authored token        display class    tone
 *   ──────────────────────────────────────────────────────
 *   env-window-lit        window           windowColour (unlit)
 *   tdf-orange            beacon           beaconColour (unlit)
 *   tdf-visor             accent           accentColour (unlit)
 *   foliage / trunks      foliage          foliageColour (lit, no edges)
 *   everything else       body             bodyColour (lit) + cyan edges
 * ```
 */
export interface SettlementDisplayTuning {
  /** Walls, roofs, towers, domes: one dark desaturated tone, lit so tops read lighter than sides. */
  readonly bodyColour: number;
  /** Trees and trunks: a darker form with no edge lines. */
  readonly foliageColour: number;
  /** Lit windows: dim cyan-white points, unlit so the token lands exactly. */
  readonly windowColour: number;
  /** The landmark's beacon: the one warm accent, unlit. */
  readonly beaconColour: number;
  /** Neon strips some styles put on a tower face. */
  readonly accentColour: number;
  /** Colour of the wire edges drawn over the bodies. */
  readonly edgeColour: number;
  /** Faces meeting at more than this angle, in degrees, get an edge line; flatter seams are noise at map size. */
  readonly edgeThresholdDeg: number;
  /** Edge opacity at and below `edgeFadeFarZoom`, where a city is a few dozen pixels wide. */
  readonly edgeOpacityFar: number;
  /** Edge opacity at and above `edgeFadeNearZoom`. */
  readonly edgeOpacityNear: number;
  /** Zoom (pixels per world unit) where the far opacity applies. */
  readonly edgeFadeFarZoom: number;
  /** Zoom where the near opacity applies; between the two the opacity is interpolated. */
  readonly edgeFadeNearZoom: number;
}

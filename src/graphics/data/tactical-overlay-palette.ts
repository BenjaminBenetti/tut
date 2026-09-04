// ===========================================
// Tactical overlay palette
// ===========================================

/**
 * Colours, opacities and footprints for the tactical tile overlays
 * (style guide §12.2). Kept apart from `tactical-overlays.ts` so the Art
 * Director can restyle the overlays without reading the movement rules,
 * and so no overlay colour is written as a literal at a call site.
 *
 * The style guide reserves four colours for this plane and forbids any
 * other use of them: `ui-info` is possibility, `ui-accent` is the
 * player's own intent, `ui-warn` and `ui-danger` are the world pushing
 * back.
 */

/** `ui-info`: where the selected unit can go for one action point. */
export const MOVE_RANGE_ONE_AP_COLOUR = 0x7fd1ff;

/**
 * The same `ui-info` hue at roughly 60% luminance, for tiles that cost
 * the unit's second action point (#521).
 *
 * Deliberately a *lightness* step rather than a second hue: the style
 * guide gives move range one token, and a hue split (blue against green,
 * say) is the split that deuteranopia and protanopia lose. Lightness
 * survives every common colour-vision deficiency, and it carries the
 * right meaning on its own — the brighter band is the cheaper one.
 */
export const MOVE_RANGE_TWO_AP_COLOUR = 0x4c7d99;

/** Opacity per tier; the dearer band recedes as well as darkens. */
export const MOVE_RANGE_ONE_AP_OPACITY = 0.35;
export const MOVE_RANGE_TWO_AP_OPACITY = 0.22;

/**
 * Quad footprint per tier, in tiles. The second band is inset so the two
 * differ in shape as well as in tone — the one channel no colour-vision
 * deficiency can take away, and what makes the boundary legible without
 * a legend, which is what #521 asks for.
 */
export const MOVE_RANGE_ONE_AP_FOOTPRINT = 0.92;
export const MOVE_RANGE_TWO_AP_FOOTPRINT = 0.66;

/** `ui-warn`: partial protection on that edge. */
export const COVER_LOW_COLOUR = 0xf0c63c;

/** `ui-danger`: full protection on that edge. */
export const COVER_HIGH_COLOUR = 0xe0453c;

/** `ui-accent`: what the current action touches. */
export const LINE_OF_SIGHT_COLOUR = 0xf08a24;

/** Opacity of the cover rings and the line-of-sight pips. */
export const COVER_OPACITY = 0.85;
export const LINE_OF_SIGHT_OPACITY = 0.9;

/**
 * Thickness of a ground tile's slab model (style guide §7). Pivot at
 * centre, so a slab placed at `tileTopCentre` occupies half of this
 * above that point as well as half below.
 */
export const GROUND_SLAB_THICKNESS = 0.05;

/**
 * Lift above the tile top, so an overlay clears the slab rather than
 * being drawn inside it.
 *
 * This has to exceed `GROUND_SLAB_THICKNESS / 2` = 0.025. It used to be
 * 0.02, which was fine while the map was flat placeholder boxes but has
 * been *below the ground surface* since #474 put the real tile models in
 * — every overlay was drawn inside the slab and depth-tested away, so
 * move range, cover and line of sight all rendered invisibly. A full
 * slab thickness clears the top half with the same margin again, and
 * still reads as painted on the ground rather than floating.
 *
 * The other layers lift by multiples of this (`× 1.5`, `× 2`, `× 3`), so
 * raising the base raises all of them together.
 */
export const OVERLAY_LIFT = GROUND_SLAB_THICKNESS;

/** Slab thickness of the range quads. */
export const RANGE_THICKNESS = 0.02;

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

/**
 * `ui-accent`: how far the selected unit can shoot (#522). The weapon
 * envelope is drawn as an outline along its edge rather than as a fill,
 * so it cannot be read as a third movement band — fill means "you can
 * stand here", line means "this far".
 */
export const WEAPON_RANGE_COLOUR = 0xf08a24;

/** Opacity and footprint of the weapon-range edge quads. */
export const WEAPON_RANGE_OPACITY = 0.5;
export const WEAPON_RANGE_FOOTPRINT = 0.96;

/** `ui-warn`: partial protection on that edge. */
export const COVER_LOW_COLOUR = 0xf0c63c;

/** `ui-danger`: full protection on that edge. */
export const COVER_HIGH_COLOUR = 0xe0453c;

/** `ui-accent`: what the current action touches. */
export const LINE_OF_SIGHT_COLOUR = 0xf08a24;

/** Opacity of the cover rings and the line-of-sight pips. */
export const COVER_OPACITY = 0.85;
export const LINE_OF_SIGHT_OPACITY = 0.9;

/** Lift above the tile top so the quads never z-fight with the map. */
export const OVERLAY_LIFT = 0.02;

/** Slab thickness of the range quads. */
export const RANGE_THICKNESS = 0.02;

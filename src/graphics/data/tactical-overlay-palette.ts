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
 * The dearer band is the **same `ui-info` token**, laid on more thinly
 * (#566). It was a darkened hex (`0x4c7d99`); QA measured that blend at
 * `80,112,128`, which sits on top of shadowed ground and cannot be told
 * apart from it. Darkening a tint to say "less" fails on a map that is
 * already dark in places — the shadow gets there first.
 *
 * Two opacities of one token instead: every blend is *lighter* than the
 * ground it covers, so both bands separate from shade, and the near band
 * is the stronger wash. The style guide gives move range one token, and a
 * hue split (blue against green, say) is the split deuteranopia and
 * protanopia lose — so the separation stays in value, and in the
 * footprint below, which no colour-vision deficiency can take away.
 */
export const MOVE_RANGE_TWO_AP_COLOUR = MOVE_RANGE_ONE_AP_COLOUR;

/**
 * Opacity per tier. The near band is laid on hard enough to read as an
 * overlay rather than as terrain — at 0.35 it blended close to the water
 * surface (`0x3f8fa8`) and players took it for a pond (#569).
 */
export const MOVE_RANGE_ONE_AP_OPACITY = 0.45;
export const MOVE_RANGE_TWO_AP_OPACITY = 0.24;

/**
 * Quad footprint per tier, in tiles. The second band is inset so the two
 * differ in shape as well as in tone — the one channel no colour-vision
 * deficiency can take away, and what makes the boundary legible without
 * a legend, which is what #521 asks for.
 *
 * Neither band fills its tile. At 0.92 the near band was near enough to
 * edge-to-edge that a run of them merged into one flat sheet of colour,
 * which is how terrain is drawn — and players read it as a pond (#569).
 * Inset far enough to leave a visible line of real ground between
 * neighbours and the same tiles read as *marked*, because the map is
 * still showing through them.
 */
export const MOVE_RANGE_ONE_AP_FOOTPRINT = 0.84;
export const MOVE_RANGE_TWO_AP_FOOTPRINT = 0.66;

/**
 * `ui-accent`: how far the selected unit can shoot (#522). The weapon
 * envelope is drawn as an outline along its edge rather than as a fill,
 * so it cannot be read as a third movement band — fill means "you can
 * stand here", line means "this far".
 */
export const WEAPON_RANGE_COLOUR = 0xf08a24;

/**
 * Opacity and footprint of the weapon-range marks.
 *
 * Nearly a whole tile at half opacity to begin with, which was fine on
 * open ground where the envelope's edge is a thin ring. In a city it is
 * not: line of sight cuts the envelope into pockets, so most tiles in it
 * border one that is out, almost every tile counts as edge, and the
 * "outline" fills. QA measured the result covering 2,233 px of the 2 AP
 * movement band (#572).
 *
 * A small centred pip instead — the same information, a tenth of the
 * ink, and the band underneath survives it.
 */
export const WEAPON_RANGE_OPACITY = 0.38;
export const WEAPON_RANGE_FOOTPRINT = 0.3;

/** `ui-warn`: partial protection on that edge. */
export const COVER_LOW_COLOUR = 0xf0c63c;

/** `ui-danger`: full protection on that edge. */
export const COVER_HIGH_COLOUR = 0xe0453c;

/** `ui-accent`: what the current action touches. */
export const LINE_OF_SIGHT_COLOUR = 0xf08a24;

/**
 * Opacity of the cover rings and the line-of-sight pips.
 *
 * Cover was 0.85, the heaviest value in this file, in the two most
 * saturated tokens it has. A mark that loud reads as a *call to action*
 * -- an objective, something to go and do -- when cover is an
 * **attribute** of a tile the player may never care about. With 13-16
 * rings on screen at once (#590) the map read as an instrument panel
 * and the eye had nowhere to rest.
 *
 * Dropped to the point where a ring is still unmistakably chromatic
 * against this map's desaturated ground -- which is what carries it,
 * not weight -- but sits *under* the unit in the visual hierarchy
 * instead of over it. Deliberately not darkened, per the note on the
 * movement bands above: on a map with shadow in it, value is the
 * channel shadow gets to first, so the retreat is in alpha and the hue
 * stays fully saturated.
 */
export const COVER_OPACITY = 0.55;

/**
 * Line of sight keeps more weight than cover. It is drawn on far fewer
 * tiles, and unlike cover it is a *threat* -- an enemy can see you
 * standing there -- which is the one thing on this plane that has
 * earned the right to interrupt.
 */
export const LINE_OF_SIGHT_OPACITY = 0.75;

/**
 * Radii of a cover ring, in tiles, and of a line-of-sight pip.
 *
 * These were literals at the call site, which the note at the top of
 * this file rules out for a colour and which is no better for a size:
 * they are art numbers, and tuning them should not mean opening the
 * service that draws them.
 *
 * The cover ring is thinner than it was (it spanned 0.28-0.40, a band
 * a third as wide as the tile, which is a donut rather than a ring).
 * A narrower annulus at the same radius keeps the tile it marks
 * legible through it.
 *
 * ```
 *   ┌───────────────┐   tile
 *   │    ,-----,    │
 *   │   ( ,---, )   │   ring: inner 0.32 → outer 0.40
 *   │   ( '---' )   │   the ground still shows inside it
 *   │    '-----'    │
 *   └───────────────┘
 * ```
 */
export const COVER_RING_INNER_RADIUS = 0.32;
export const COVER_RING_OUTER_RADIUS = 0.4;
export const COVER_RING_SEGMENTS = 16;
export const LINE_OF_SIGHT_PIP_INNER_RADIUS = 0.12;
export const LINE_OF_SIGHT_PIP_OUTER_RADIUS = 0.18;
export const LINE_OF_SIGHT_PIP_SEGMENTS = 12;

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

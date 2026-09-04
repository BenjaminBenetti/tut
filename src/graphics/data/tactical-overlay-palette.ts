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
 * Opacity of the weapon-range boundary.
 *
 * Higher than any fill on this plane, because it is a *line*: a thin
 * ribbon carries far less ink than a tinted tile, so it can be nearly
 * solid without competing with the ground, and a boundary that is not
 * crisp does not read as a limit.
 *
 * Both earlier attempts were fills. Nearly a whole tile at half opacity
 * buried the 2 AP band under it (#572; QA measured 2,233 px). Shrinking
 * that to a 0.3 pip fixed the ink and kept the mistake — it was still
 * one mark per tile for a fact that is the same everywhere (#624).
 */
export const WEAPON_RANGE_OPACITY = 0.9;

/** `ui-warn`: partial protection on that edge. */
export const COVER_LOW_COLOUR = 0xf0c63c;

/** `ui-danger`: full protection on that edge. */
export const COVER_HIGH_COLOUR = 0xe0453c;

/**
 * `ui-danger`: this tile will refuse the shot (#624).
 *
 * Same token as high cover, deliberately, and a different **shape** --
 * a diamond, never a ring. That is the rule the overlay planes now
 * follow: the question a mark answers is carried by its shape, and the
 * colour only says how loudly the world is pushing back.
 */
export const BLOCKED_SHOT_COLOUR = 0xe0453c;

/**
 * Opacity of the cover rings and the line-of-sight pips.
 *
 * This has been up and down, and the reason is that it was never
 * really about the weight.
 *
 * At 0.85 as a big centred ring it read as a *call to action* -- an
 * objective, something to go and do -- when cover is an attribute of a
 * tile the player may never care about, and #590 cut it to 0.55 for
 * that. Once the mark became a tick against the wall that earns it
 * (#624), 0.55 made it disappear: the ring was loud because of where
 * it sat, not how strong it was, and a thin bar at the tile edge reads
 * as part of the wall no matter how solid it is.
 *
 * So it is back near where it started, and the shape is what keeps it
 * quiet. **A mark's position in the hierarchy comes from what it is
 * attached to, not from its alpha.**
 */
export const COVER_OPACITY = 0.8;

/**
 * The blocked-shot mark can afford weight because it is now genuinely
 * rare: it needs a target armed, and then marks only the reachable
 * tiles with no line to it.
 *
 * The reasoning it replaces was wrong on its premise. #590 gave sight
 * more weight than cover "because it is drawn on far fewer tiles" --
 * measured against fixtures where no enemy was visible and the count
 * was zero. With nine bugs on the board it marked 93 of 93 reachable
 * tiles (#624).
 */
export const BLOCKED_SHOT_OPACITY = 0.9;

/**
 * The cover tick: a bar lying along the tile edge the cover is on.
 *
 * **Cover is directional, and a centred ring threw that away** (#624).
 * The rules already know which side each wall protects -- `coverAgainst`
 * is asked about all four and the answers were collapsed to their
 * maximum -- so the mark can say *which* side, and sit against the wall
 * that earns it instead of floating in the middle of the tile looking
 * like a target.
 *
 * ```
 *   ┌───────────────┐   tile
 *   │ ▁▁▁▁▁▁▁▁▁▁▁▁▁ │   a tick on the north edge: this side is covered
 *   │               │
 *   │               │   nothing in the middle, so the blocked-shot
 *   │               │   diamond has the centre to itself
 *   └───────────────┘
 * ```
 *
 * Shorter than the edge so neighbouring ticks do not run together into
 * a continuous line -- which is the weapon-range boundary's shape, and
 * no two planes may share one.
 */
export const COVER_TICK_LENGTH = 0.6;
export const COVER_TICK_WIDTH = 0.14;

/**
 * How far in from the tile edge the tick sits, in tiles.
 *
 * Just enough to clear the edge itself: two tiles either side of the
 * same wall are both covered by it, and each draws its own tick, so
 * they must not land on top of each other.
 */
export const COVER_TICK_INSET = 0.09;
/** Side of the blocked-shot diamond, in tiles, before its 45 degree turn. */
export const BLOCKED_SHOT_SIZE = 0.26;

/**
 * Width of the weapon-range boundary ribbon, in tiles (#624).
 *
 * The envelope is drawn as **one continuous line around its perimeter**,
 * not a mark per tile: it states a single fact -- this far -- so it gets
 * a single shape. It was a pip stamped on every edge tile, which is N
 * marks for one fact and reads as another field of somewhere to stand.
 *
 * Drawn as a thin ribbon of ground quads rather than `LineSegments`,
 * because WebGL ignores `linewidth` on almost every platform and a
 * one-pixel line disappears at the far zoom stop.
 */
export const WEAPON_RANGE_LINE_WIDTH = 0.09;

/**
 * Thickness of a ground tile's **authored slab model** (style guide §7).
 * Pivot at centre, so a slab placed at `tileTopCentre` occupies half of
 * this above that point as well as half below — which is why
 * `map-model-resolver` subtracts half of it to sit the model's top face
 * on the surface.
 *
 * **This does not define where the surface is.** `SLAB_HEIGHT` (0.15,
 * in `mapgen-preview-palette`) does, through `tileTop`, and the art is
 * fitted to it. Reading this one as "the slab thickness" and assuming
 * the plane follows from it is the mistake that produced #557; the two
 * numbers are different on purpose and answer different questions
 * (#626).
 */
export const GROUND_SLAB_THICKNESS = 0.05;

/**
 * Lift above the tile top, so an overlay does not z-fight the ground it
 * is painted on.
 *
 * A nudge, which is all it ever should have been. It was raised to a
 * whole slab thickness in #555 because the slab model was placed with
 * its pivot on `tileTop`, putting the surface half a slab *above* the
 * plane every overlay measured from, so an overlay at 0.02 was drawn
 * inside the ground and depth-tested away. #557 moved the slab so its
 * top face lands on `tileTop`, which is where the preview box has always
 * put its own, so clearing the surface no longer costs anything and this
 * goes back to keeping two coincident planes apart.
 *
 * The other layers lift by multiples of this (`× 1.5`, `× 2`, `× 3`), so
 * raising the base raises all of them together.
 */
export const OVERLAY_LIFT = 0.02;

/** Slab thickness of the range quads. */
export const RANGE_THICKNESS = 0.02;

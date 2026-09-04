// ===========================================
// Tactical lighting
// ===========================================

/**
 * The tactical scene's lighting and shadow rig (style guide §12.1).
 *
 * Kept apart from `scene-service.ts` for the reason the overlay palette
 * is kept apart from the overlays: these are art numbers, and retuning
 * the look should not mean opening the file that owns the renderer.
 *
 * The camera rotates and the lights do not, so a given face always
 * shades the same way and the player learns the read.
 */

/** Key light colour and direction. Off-axis from all four yaw stops (§2). */
export const KEY_LIGHT_COLOUR = 0xffffff;
export const KEY_LIGHT_POSITION = { x: 4, y: 8, z: 12 } as const;

/**
 * Key intensity, raised from 2.5 with shadows on.
 *
 * A surface in shadow loses the key entirely and keeps only the fill, so
 * without this the whole scene reads dimmer than it did unlit rather
 * than more contrasty.
 */
export const KEY_LIGHT_INTENSITY = 2.9;

/**
 * Fill intensity, dropped from 0.8 with shadows on.
 *
 * **This is half the effect and the more important half.** At 0.8 the
 * fill washes the shadows into grey smudges and the shadow map buys
 * nothing for its milliseconds. At 0.55 shadows read while unlit faces
 * stay legible, which is the constraint §12.1 set in the first place.
 */
export const FILL_LIGHT_INTENSITY = 0.55;

/** Fill intensity without shadows; the overworld still uses this. */
export const FILL_LIGHT_INTENSITY_UNSHADOWED = 0.8;

/** Key intensity without shadows. */
export const KEY_LIGHT_INTENSITY_UNSHADOWED = 2.5;

/**
 * Shadow map resolution.
 *
 * 2048 is comfortable on a GPU. The end-to-end suite renders through
 * software SwiftShader, where this is the one number worth dropping if
 * it costs wall-clock; 1024 still reads at 64 px per tile.
 */
export const SHADOW_MAP_SIZE = 2048;

/**
 * Half-extent of the shadow camera's orthographic frustum, in world
 * units, and its depth range.
 *
 * The frustum follows the view rather than the map: a `DirectionalLight`
 * targets the origin, which on a 40 x 40 map is a corner, so a fixed
 * frustum shadows a part of the map the player is not looking at. 30
 * covers the visible ground at every zoom stop with room for the
 * buildings casting into it from outside the frame.
 */
export const SHADOW_FRUSTUM_HALF_EXTENT = 30;
export const SHADOW_CAMERA_NEAR = 0.5;
export const SHADOW_CAMERA_FAR = 120;

/**
 * Depth bias.
 *
 * `bias` pushes the comparison off the surface to stop a lit face
 * shadowing itself in stripes; `normalBias` does the same along the
 * normal, which is what handles the thin slabs -- ground tiles are
 * 0.05 u thick and acne on them shows as a moire over the whole street.
 */
export const SHADOW_BIAS = -0.0015;
export const SHADOW_NORMAL_BIAS = 0.02;

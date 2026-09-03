/**
 * VFX sprite registry (style guide §9). Every sprite is a transparent RGBA
 * PNG at most 512×512 under `public/assets/sprites/vfx/`, generated with
 * `tools/art/gen-image.sh`; the prompt sidecars live in `docs/design/sprites/`.
 * Presentation code references sprites by `SpriteId`, never by a path
 * literal (architecture §7).
 */

// ===========================================
// Types
// ===========================================

/** Frame layout of an animation sheet, read left to right then top to bottom. */
export interface SpriteSheet {
  /** Square frame size in pixels. */
  readonly frame: number;
  readonly columns: number;
  readonly rows: number;
  /** Frames actually used (may be fewer than columns × rows). */
  readonly frames: number;
  /** Suggested display time per frame, milliseconds. */
  readonly frameMs: number;
}

/** One registered sprite asset. */
export interface SpriteAssetEntry {
  /** Path under `public/`, e.g. `assets/sprites/vfx/muzzle-flash.png`. */
  readonly path: string;
  /** Square pixel size of a single sprite, or the sheet's width for animation sheets. */
  readonly size: 256 | 384 | 512;
  /** Present for animation sheets; the image is `columns × frame` wide and `rows × frame` tall. */
  readonly sheet?: SpriteSheet;
  /** Blend mode the renderer should use. */
  readonly blend: "additive" | "normal";
  /** What the sprite depicts, for tooling and debugging. */
  readonly label: string;
}

// ===========================================
// Manifest
// ===========================================

/** Every VFX sprite, keyed by id. */
export const SPRITE_MANIFEST = {
  "vfx.muzzle-flash": {
    path: "assets/sprites/vfx/muzzle-flash.png",
    size: 512,
    blend: "additive",
    label: "Autocannon muzzle flash, side view",
  },
  "vfx.impact": {
    path: "assets/sprites/vfx/impact.png",
    size: 512,
    blend: "additive",
    label: "Bullet impact spark burst on chitin",
  },
  "vfx.egg-burst": {
    path: "assets/sprites/vfx/egg-burst.png",
    size: 512,
    blend: "normal",
    label: "Egg spawner hatch burst",
  },
  "vfx.muzzle-flash-sheet": {
    path: "assets/sprites/vfx/muzzle-flash-sheet.png",
    size: 256,
    blend: "additive",
    label: "Muzzle flash, 4 frames: grow, peak, tongue, fade",
    sheet: { frame: 128, columns: 2, rows: 2, frames: 4, frameMs: 40 },
  },
  "vfx.impact-sheet": {
    path: "assets/sprites/vfx/impact-sheet.png",
    size: 256,
    blend: "additive",
    label: "Bullet impact, 4 frames: spark, full, fragments, fade",
    sheet: { frame: 128, columns: 2, rows: 2, frames: 4, frameMs: 50 },
  },
  "vfx.egg-burst-sheet": {
    path: "assets/sprites/vfx/egg-burst-sheet.png",
    size: 384,
    blend: "normal",
    label: "Egg burst, 6 frames: swell to splash to fade",
    sheet: { frame: 128, columns: 3, rows: 2, frames: 6, frameMs: 70 },
  },
} as const satisfies Record<string, SpriteAssetEntry>;

/** Union of registered sprite ids. */
export type SpriteId = keyof typeof SPRITE_MANIFEST;

/**
 * Resolves a sprite id to its public URL, prefixed with Vite's `BASE_URL`
 * so a sub-path deploy still finds the asset.
 * @param id - Registered sprite id.
 * @returns Absolute URL path of the PNG.
 */
export function spriteUrl(id: SpriteId): string {
  return `${import.meta.env.BASE_URL}${SPRITE_MANIFEST[id].path}`;
}

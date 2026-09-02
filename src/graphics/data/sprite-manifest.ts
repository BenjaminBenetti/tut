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

/** One registered sprite asset. */
export interface SpriteAssetEntry {
  /** Path under `public/`, e.g. `assets/sprites/vfx/muzzle-flash.png`. */
  readonly path: string;
  /** Square pixel size of the image. */
  readonly size: 256 | 512;
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

/**
 * Texture registry (style guide §6, §9). Textures are PNGs under
 * `public/assets/textures/`; presentation code references them by
 * `TextureId`, never by a path literal (architecture §7). Sidecars with the
 * prompt or build script live in `docs/design/textures/`.
 */

// ===========================================
// Types
// ===========================================

/** One registered texture asset. */
export interface TextureAssetEntry {
  /** Path under `public/`, e.g. `assets/textures/overworld/earth-map_albedo.png`. */
  readonly path: string;
  /** Pixel width. */
  readonly width: number;
  /** Pixel height. */
  readonly height: number;
  /** Colour space the loader should assign (albedo is sRGB, data maps linear). */
  readonly colorSpace: "srgb" | "linear";
  /** What the texture is for. */
  readonly label: string;
}

// ===========================================
// Manifest
// ===========================================

/** Every texture, keyed by id. */
export const TEXTURE_MANIFEST = {
  "overworld.earth-map": {
    path: "assets/textures/overworld/earth-map_albedo.png",
    width: 2048,
    height: 1024,
    colorSpace: "srgb",
    label: "Stylised plate carrée world map for the overworld plane",
  },
} as const satisfies Record<string, TextureAssetEntry>;

/** Union of registered texture ids. */
export type TextureId = keyof typeof TEXTURE_MANIFEST;

/**
 * Resolves a texture id to its public URL, prefixed with Vite's `BASE_URL`
 * so a sub-path deploy still finds the asset.
 * @param id - Registered texture id.
 * @returns Absolute URL path of the PNG.
 */
export function textureUrl(id: TextureId): string {
  return `${import.meta.env.BASE_URL}${TEXTURE_MANIFEST[id].path}`;
}

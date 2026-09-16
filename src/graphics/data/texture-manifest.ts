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
  /** Path under `public/`, e.g. `assets/textures/units/tdf-atlas_albedo.png`. */
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
  "business.grocery.0": {
    path: "assets/textures/business-signs/names/grocery-0.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "grocery business names 1–10",
  },
  "business.grocery.1": {
    path: "assets/textures/business-signs/names/grocery-1.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "grocery business names 11–20",
  },
  "business.grocery.2": {
    path: "assets/textures/business-signs/names/grocery-2.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "grocery business names 21–30",
  },
  "business.grocery.3": {
    path: "assets/textures/business-signs/names/grocery-3.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "grocery business names 31–40",
  },
  "business.grocery.4": {
    path: "assets/textures/business-signs/names/grocery-4.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "grocery business names 41–50",
  },
  "business.bakery-cafe.0": {
    path: "assets/textures/business-signs/names/bakery-cafe-0.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "bakery-cafe business names 1–10",
  },
  "business.bakery-cafe.1": {
    path: "assets/textures/business-signs/names/bakery-cafe-1.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "bakery-cafe business names 11–20",
  },
  "business.bakery-cafe.2": {
    path: "assets/textures/business-signs/names/bakery-cafe-2.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "bakery-cafe business names 21–30",
  },
  "business.bakery-cafe.3": {
    path: "assets/textures/business-signs/names/bakery-cafe-3.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "bakery-cafe business names 31–40",
  },
  "business.bakery-cafe.4": {
    path: "assets/textures/business-signs/names/bakery-cafe-4.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "bakery-cafe business names 41–50",
  },
  "business.pharmacy.0": {
    path: "assets/textures/business-signs/names/pharmacy-0.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "pharmacy business names 1–10",
  },
  "business.pharmacy.1": {
    path: "assets/textures/business-signs/names/pharmacy-1.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "pharmacy business names 11–20",
  },
  "business.pharmacy.2": {
    path: "assets/textures/business-signs/names/pharmacy-2.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "pharmacy business names 21–30",
  },
  "business.pharmacy.3": {
    path: "assets/textures/business-signs/names/pharmacy-3.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "pharmacy business names 31–40",
  },
  "business.pharmacy.4": {
    path: "assets/textures/business-signs/names/pharmacy-4.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "pharmacy business names 41–50",
  },
  "business.clothing.0": {
    path: "assets/textures/business-signs/names/clothing-0.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "clothing business names 1–10",
  },
  "business.clothing.1": {
    path: "assets/textures/business-signs/names/clothing-1.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "clothing business names 11–20",
  },
  "business.clothing.2": {
    path: "assets/textures/business-signs/names/clothing-2.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "clothing business names 21–30",
  },
  "business.clothing.3": {
    path: "assets/textures/business-signs/names/clothing-3.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "clothing business names 31–40",
  },
  "business.clothing.4": {
    path: "assets/textures/business-signs/names/clothing-4.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "clothing business names 41–50",
  },
  "business.electronics.0": {
    path: "assets/textures/business-signs/names/electronics-0.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "electronics business names 1–10",
  },
  "business.electronics.1": {
    path: "assets/textures/business-signs/names/electronics-1.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "electronics business names 11–20",
  },
  "business.electronics.2": {
    path: "assets/textures/business-signs/names/electronics-2.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "electronics business names 21–30",
  },
  "business.electronics.3": {
    path: "assets/textures/business-signs/names/electronics-3.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "electronics business names 31–40",
  },
  "business.electronics.4": {
    path: "assets/textures/business-signs/names/electronics-4.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "electronics business names 41–50",
  },
  "business.hardware.0": {
    path: "assets/textures/business-signs/names/hardware-0.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "hardware business names 1–10",
  },
  "business.hardware.1": {
    path: "assets/textures/business-signs/names/hardware-1.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "hardware business names 11–20",
  },
  "business.hardware.2": {
    path: "assets/textures/business-signs/names/hardware-2.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "hardware business names 21–30",
  },
  "business.hardware.3": {
    path: "assets/textures/business-signs/names/hardware-3.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "hardware business names 31–40",
  },
  "business.hardware.4": {
    path: "assets/textures/business-signs/names/hardware-4.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "hardware business names 41–50",
  },
  "business.bookshop.0": {
    path: "assets/textures/business-signs/names/bookshop-0.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "bookshop business names 1–10",
  },
  "business.bookshop.1": {
    path: "assets/textures/business-signs/names/bookshop-1.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "bookshop business names 11–20",
  },
  "business.bookshop.2": {
    path: "assets/textures/business-signs/names/bookshop-2.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "bookshop business names 21–30",
  },
  "business.bookshop.3": {
    path: "assets/textures/business-signs/names/bookshop-3.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "bookshop business names 31–40",
  },
  "business.bookshop.4": {
    path: "assets/textures/business-signs/names/bookshop-4.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "bookshop business names 41–50",
  },
  "business.offices.0": {
    path: "assets/textures/business-signs/names/offices-0.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "offices business names 1–10",
  },
  "business.offices.1": {
    path: "assets/textures/business-signs/names/offices-1.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "offices business names 11–20",
  },
  "business.offices.2": {
    path: "assets/textures/business-signs/names/offices-2.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "offices business names 21–30",
  },
  "business.offices.3": {
    path: "assets/textures/business-signs/names/offices-3.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "offices business names 31–40",
  },
  "business.offices.4": {
    path: "assets/textures/business-signs/names/offices-4.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "offices business names 41–50",
  },
  "business.depot.0": {
    path: "assets/textures/business-signs/names/depot-0.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "depot business names 1–10",
  },
  "business.depot.1": {
    path: "assets/textures/business-signs/names/depot-1.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "depot business names 11–20",
  },
  "business.depot.2": {
    path: "assets/textures/business-signs/names/depot-2.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "depot business names 21–30",
  },
  "business.depot.3": {
    path: "assets/textures/business-signs/names/depot-3.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "depot business names 31–40",
  },
  "business.depot.4": {
    path: "assets/textures/business-signs/names/depot-4.png",
    width: 1024,
    height: 1024,
    colorSpace: "srgb",
    label: "depot business names 41–50",
  },

  "units.tdf-atlas": {
    path: "assets/textures/units/tdf-atlas_albedo.png",
    width: 512,
    height: 512,
    colorSpace: "srgb",
    label:
      "TDF unit atlas: armour, cloth, markings, visor (4×4 cells of 128 px)",
  },
  "units.bug-atlas": {
    path: "assets/textures/units/bug-atlas_albedo.png",
    width: 512,
    height: 512,
    colorSpace: "srgb",
    label:
      "Bug unit atlas: chitin, flesh, bioluminescence, bone (4×4 cells of 128 px)",
  },
  "tiles.env-atlas": {
    path: "assets/textures/tiles/env-atlas_albedo.png",
    width: 512,
    height: 512,
    colorSpace: "srgb",
    label:
      "Environment atlas: ground, road, building kit, water, foliage (4×4 cells of 128 px)",
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

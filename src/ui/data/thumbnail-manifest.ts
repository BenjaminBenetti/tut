import type { ModelAssetId } from "../../content/data/model-ids";

/**
 * Unit and mech-part thumbnails for the roster, mech-bay and deployment
 * screens: 128×128 RGBA PNGs on a transparent background rendered from the
 * placeholder models by `tools/art/preview/render-thumbnails.mjs`. Keyed by
 * the model id they depict, so a screen that holds a `ModelAssetId` can show
 * its picture without spelling a path (architecture §7).
 */

// ===========================================
// Types
// ===========================================

/** One registered thumbnail. */
export interface ThumbnailAssetEntry {
  /** Path under `public/`, e.g. `assets/ui/thumbs/tdf.mech.chassis-a.png`. */
  readonly path: string;
  /** Model the thumbnail depicts. */
  readonly model: ModelAssetId;
  /** Human-readable name for alt text and tooltips. */
  readonly label: string;
}

// ===========================================
// Manifest
// ===========================================

/** Every thumbnail, keyed by model id. */
export const THUMBNAIL_MANIFEST = {
  "tdf.infantry.rifle": {
    path: "assets/ui/thumbs/tdf.infantry.rifle.png",
    model: "tdf.infantry.rifle",
    label: "Rifle squad",
  },
  "tdf.infantry.rocket": {
    path: "assets/ui/thumbs/tdf.infantry.rocket.png",
    model: "tdf.infantry.rocket",
    label: "Rocket squad",
  },
  "tdf.infantry.sniper": {
    path: "assets/ui/thumbs/tdf.infantry.sniper.png",
    model: "tdf.infantry.sniper",
    label: "Sniper squad",
  },
  "tdf.infantry.engineer": {
    path: "assets/ui/thumbs/tdf.infantry.engineer.png",
    model: "tdf.infantry.engineer",
    label: "Engineer squad",
  },
  "tdf.infantry.medic": {
    path: "assets/ui/thumbs/tdf.infantry.medic.png",
    model: "tdf.infantry.medic",
    label: "Medic squad",
  },
  "tdf.mech.legs-a": {
    path: "assets/ui/thumbs/tdf.mech.legs-a.png",
    model: "tdf.mech.legs-a",
    label: "Legs A",
  },
  "tdf.mech.chassis-a": {
    path: "assets/ui/thumbs/tdf.mech.chassis-a.png",
    model: "tdf.mech.chassis-a",
    label: "Chassis A",
  },
  "tdf.mech.arm-l-a": {
    path: "assets/ui/thumbs/tdf.mech.arm-l-a.png",
    model: "tdf.mech.arm-l-a",
    label: "Left arm A",
  },
  "tdf.mech.arm-r-a": {
    path: "assets/ui/thumbs/tdf.mech.arm-r-a.png",
    model: "tdf.mech.arm-r-a",
    label: "Right arm A",
  },
  "tdf.mech.weapon-arm.autocannon": {
    path: "assets/ui/thumbs/tdf.mech.weapon-arm.autocannon.png",
    model: "tdf.mech.weapon-arm.autocannon",
    label: "Autocannon (arm weapon)",
  },
  "tdf.mech.weapon-back.missile-pod": {
    path: "assets/ui/thumbs/tdf.mech.weapon-back.missile-pod.png",
    model: "tdf.mech.weapon-back.missile-pod",
    label: "Missile pod (back weapon)",
  },
  "tdf.mech.assembled-a": {
    path: "assets/ui/thumbs/tdf.mech.assembled-a.png",
    model: "tdf.mech.assembled-a",
    label: "Mech A, assembled",
  },
  "bug.swarmer": {
    path: "assets/ui/thumbs/bug.swarmer.png",
    model: "bug.swarmer",
    label: "Swarmer",
  },
  "bug.lurker": {
    path: "assets/ui/thumbs/bug.lurker.png",
    model: "bug.lurker",
    label: "Lurker",
  },
  "bug.brute": {
    path: "assets/ui/thumbs/bug.brute.png",
    model: "bug.brute",
    label: "Brute",
  },
  "bug.egg-spawner": {
    path: "assets/ui/thumbs/bug.egg-spawner.png",
    model: "bug.egg-spawner",
    label: "Egg spawner",
  },
} as const satisfies Record<string, ThumbnailAssetEntry>;

/** Union of registered thumbnail ids. */
export type ThumbnailId = keyof typeof THUMBNAIL_MANIFEST;

/**
 * Resolves a thumbnail id to its public URL, prefixed with Vite's `BASE_URL`
 * so a sub-path deploy still finds the asset.
 * @param id - Registered thumbnail id.
 * @returns Absolute URL path of the PNG.
 */
export function thumbnailUrl(id: ThumbnailId): string {
  return `${import.meta.env.BASE_URL}${THUMBNAIL_MANIFEST[id].path}`;
}

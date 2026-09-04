import type { PartId } from "../../roster/model/mech-part";
import type { ThumbnailId } from "./thumbnail-manifest";

// ===========================================
// Part thumbnails
// ===========================================

/**
 * Style guide §7 "Part catalogue → models", as the thumbnail each part
 * shows in the mech bay (#495). The table is here rather than on
 * `MechPart` because which picture a part has is a presentation
 * question: the roster model names no asset (architecture §7).
 *
 * ```
 *   PartId ──► ThumbnailId ──► thumbnailUrl ──► assets/ui/thumbs/<model>.png
 * ```
 *
 * A part with two models — arms come as a left and a right — shows the
 * left one; they are mirrored, so the pair reads the same at 64 px.
 * Utility parts have no visual slot and so no thumbnail, which is why
 * the lookup returns `undefined` rather than a placeholder.
 */
export const PART_THUMBNAILS: Readonly<Partial<Record<PartId, ThumbnailId>>> = {
  "chassis-vanguard": "tdf.mech.chassis-a",
  "chassis-bulwark": "tdf.mech.chassis.bulwark",
  "chassis-atlas": "tdf.mech.chassis.atlas",
  "legs-strider": "tdf.mech.legs-a",
  "legs-bastion": "tdf.mech.legs.bastion",
  "legs-jumper": "tdf.mech.legs.jumper",
  "arms-tracker": "tdf.mech.arm-l-a",
  "arms-manipulator": "tdf.mech.arms.manipulator-l",
  "arms-brace": "tdf.mech.arms.brace-l",
  "arm-weapon-autocannon": "tdf.mech.weapon-arm.autocannon",
  "arm-weapon-flamer": "tdf.mech.weapon-arm.flamer",
  "arm-weapon-laser": "tdf.mech.weapon-arm.laser",
  "arm-weapon-railgun": "tdf.mech.weapon-arm.railgun",
  "back-weapon-missile-pod": "tdf.mech.weapon-back.missile-pod",
  "back-weapon-mortar": "tdf.mech.weapon-back.mortar",
  "back-weapon-rotary-cannon": "tdf.mech.weapon-back.rotary-cannon",
};

/** The thumbnail for a part, or undefined for one with no visual slot. */
export function partThumbnail(partId: PartId): ThumbnailId | undefined {
  return PART_THUMBNAILS[partId];
}

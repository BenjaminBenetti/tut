import type { ModelAssetId } from "../../content/data/model-ids";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { PartId } from "../../roster/model/mech-part";

// ===========================================
// Types
// ===========================================

/**
 * The model or models a part is drawn with. Arms come as a mirrored
 * pair — a mech has two — and everything else is a single model, so the
 * two cases are separate rather than an array a caller has to count.
 */
export type PartModels =
  | { readonly kind: "single"; readonly model: ModelAssetId }
  | {
      readonly kind: "pair";
      readonly left: ModelAssetId;
      readonly right: ModelAssetId;
    };

/**
 * One mech's worth of models, resolved from a loadout and ready to hang
 * on the §6 sockets. Every field is optional: a draft mid-edit can name
 * a part that has no model, and a preview draws what it can rather than
 * refusing the whole mech.
 */
export interface MechAssembly {
  readonly legs?: ModelAssetId;
  readonly chassis?: ModelAssetId;
  readonly armLeft?: ModelAssetId;
  readonly armRight?: ModelAssetId;
  readonly armWeapon?: ModelAssetId;
  readonly backWeapon?: ModelAssetId;
}

// ===========================================
// Part models
// ===========================================

/**
 * Style guide §7 "Part catalogue → models". The table lives in
 * `graphics/` because which model draws a part is a rendering question:
 * the roster names no asset (architecture §7), exactly as the mech
 * bay's thumbnail table sits in `ui/data/`.
 *
 * ```
 *   PartId ──► PartModels ──► ModelAssetId ──► MODEL_MANIFEST ──► .glb
 * ```
 *
 * Utility parts have no visual slot, so they are absent rather than
 * mapped to a placeholder.
 */
export const PART_MODELS: Readonly<Partial<Record<PartId, PartModels>>> = {
  "chassis-vanguard": { kind: "single", model: "tdf.mech.chassis-a" },
  "chassis-bulwark": { kind: "single", model: "tdf.mech.chassis.bulwark" },
  "chassis-atlas": { kind: "single", model: "tdf.mech.chassis.atlas" },
  "legs-strider": { kind: "single", model: "tdf.mech.legs-a" },
  "legs-bastion": { kind: "single", model: "tdf.mech.legs.bastion" },
  "legs-jumper": { kind: "single", model: "tdf.mech.legs.jumper" },
  "arms-tracker": {
    kind: "pair",
    left: "tdf.mech.arm-l-a",
    right: "tdf.mech.arm-r-a",
  },
  "arms-manipulator": {
    kind: "pair",
    left: "tdf.mech.arms.manipulator-l",
    right: "tdf.mech.arms.manipulator-r",
  },
  "arms-brace": {
    kind: "pair",
    left: "tdf.mech.arms.brace-l",
    right: "tdf.mech.arms.brace-r",
  },
  "arm-weapon-autocannon": {
    kind: "single",
    model: "tdf.mech.weapon-arm.autocannon",
  },
  "arm-weapon-flamer": { kind: "single", model: "tdf.mech.weapon-arm.flamer" },
  "arm-weapon-laser": { kind: "single", model: "tdf.mech.weapon-arm.laser" },
  "arm-weapon-railgun": {
    kind: "single",
    model: "tdf.mech.weapon-arm.railgun",
  },
  "back-weapon-missile-pod": {
    kind: "single",
    model: "tdf.mech.weapon-back.missile-pod",
  },
  "back-weapon-mortar": {
    kind: "single",
    model: "tdf.mech.weapon-back.mortar",
  },
  "back-weapon-rotary-cannon": {
    kind: "single",
    model: "tdf.mech.weapon-back.rotary-cannon",
  },
};

// ===========================================
// Lookups
// ===========================================

/** The models for a part, or undefined for one with no visual slot. */
export function partModels(partId: PartId): PartModels | undefined {
  return PART_MODELS[partId];
}

/** The single model for a part, ignoring the left of a mirrored pair. */
function singleModel(partId: PartId): ModelAssetId | undefined {
  const models = partModels(partId);
  return models?.kind === "single" ? models.model : undefined;
}

/**
 * Resolves a loadout to the models that draw it.
 *
 * The arm weapon goes on the **right** arm and the left stays bare,
 * because the loadout carries one `armWeaponId`. Fitting the same
 * weapon to both arms would draw a second gun the player never bought
 * and did not pay for, and the stat sheet counts it once.
 */
export function mechAssemblyFor(loadout: MechLoadout): MechAssembly {
  const arms = partModels(loadout.armsId);
  return {
    legs: singleModel(loadout.legsId),
    chassis: singleModel(loadout.chassisId),
    armLeft: arms?.kind === "pair" ? arms.left : undefined,
    armRight: arms?.kind === "pair" ? arms.right : undefined,
    armWeapon: singleModel(loadout.armWeaponId),
    backWeapon: singleModel(loadout.backWeaponId),
  };
}

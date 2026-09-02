import type { PartId, PartSlot } from "./mech-part";

// ===========================================
// Types
// ===========================================

/**
 * Upgrade level per fitted part, keyed by part id. Absent means level 0.
 * Reserved for the part-upgrade issue (#69); nothing reads it yet.
 */
export type PartUpgrades = Readonly<Record<PartId, number>>;

/**
 * A named selection of parts, one per single-part slot plus any number of
 * utilities (GDD §5.8). Loadouts are templates: the player saves them by
 * name and builds mechs from them. Plain data, unvalidated; the loadout
 * validation service (#49) decides whether one is buildable.
 *
 * ```
 *   MechLoadout "Skirmisher"
 *   ├── chassisId     "chassis-vanguard"
 *   ├── legsId        "legs-strider"
 *   ├── armsId        "arms-manipulator"
 *   ├── armWeaponId   "arm-weapon-autocannon"
 *   ├── backWeaponId  "back-weapon-missile-pod"
 *   ├── utilityIds    ["utility-radiator"]
 *   └── upgrades?     { "arm-weapon-autocannon": 1 }
 * ```
 */
export interface MechLoadout {
  /** Player-facing name, e.g. `"Skirmisher"`. */
  readonly name: string;
  readonly chassisId: PartId;
  readonly legsId: PartId;
  readonly armsId: PartId;
  readonly armWeaponId: PartId;
  readonly backWeaponId: PartId;
  /** Utility parts, at most the chassis' `utilitySlots`; order is cosmetic. */
  readonly utilityIds: readonly PartId[];
  /** Per-part upgrade levels; omitted when nothing is upgraded. */
  readonly upgrades?: PartUpgrades;
}

/** Slots that hold exactly one part, i.e. every slot but `utility`. */
export type SinglePartSlot = Exclude<PartSlot, "utility">;

// ===========================================
// Constants
// ===========================================

/**
 * The loadout field that holds the part id for each single-part slot, so
 * services can walk the slots without spelling the field names out.
 */
export const LOADOUT_FIELD_FOR_SLOT = {
  chassis: "chassisId",
  legs: "legsId",
  arms: "armsId",
  "arm-weapon": "armWeaponId",
  "back-weapon": "backWeaponId",
} as const satisfies Record<SinglePartSlot, keyof MechLoadout>;

// ===========================================
// Functions
// ===========================================

/**
 * Lists every part id in a loadout: chassis first, then legs, arms, arm
 * weapon, back weapon, then utilities in their stored order. Duplicates
 * are kept so a validator can spot them.
 */
export function loadoutPartIds(loadout: MechLoadout): readonly PartId[] {
  return [
    loadout.chassisId,
    loadout.legsId,
    loadout.armsId,
    loadout.armWeaponId,
    loadout.backWeaponId,
    ...loadout.utilityIds,
  ];
}

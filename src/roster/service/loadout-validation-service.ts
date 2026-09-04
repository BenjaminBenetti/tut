import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { LoadoutError } from "../model/loadout-error";
import type { MechLoadout, SinglePartSlot } from "../model/mech-loadout";
import { LOADOUT_FIELD_FOR_SLOT } from "../model/mech-loadout";
import type {
  ChassisPart,
  MechPart,
  PartId,
  PartSlot,
  PartStats,
} from "../model/mech-part";
import { isChassisPart } from "../model/mech-part";
import type { MechRatingTuning } from "../model/mech-rating-tuning";
import type { MechStatSheet, MechWeapon } from "../model/mech-stat-sheet";
import type { PartCatalogue } from "../model/part-catalogue";
import type { UpgradeTuning } from "../model/upgrade-tuning";
import {
  cumulativeUpgradeCost,
  effectivePartStats,
  sumPartStats,
} from "./part-stat-service";

// ===========================================
// Constants
// ===========================================

/** Single-part slots in mech-bay order, walked when resolving a loadout. */
const SINGLE_PART_SLOTS: readonly SinglePartSlot[] = [
  "chassis",
  "legs",
  "arms",
  "arm-weapon",
  "back-weapon",
];

// ===========================================
// Types
// ===========================================

/** A part found for a slot together with the upgrade level the loadout gives it. */
interface FittedPart {
  readonly part: MechPart;
  readonly upgradeLevel: number;
}

/** Everything the resolve pass found, whether or not it all resolved. */
interface ResolvedLoadout {
  readonly chassis: ChassisPart | undefined;
  /** Every resolved non-chassis part, utilities included. */
  readonly components: readonly FittedPart[];
  readonly errors: LoadoutError[];
}

// ===========================================
// Public Functions
// ===========================================

/**
 * Checks a loadout against the catalogue and, when it is buildable,
 * returns its stat sheet (GDD §5.8). Pure: reads only its arguments.
 *
 * ```
 *   loadout ──► resolve each slot ──► missing-part / unknown-part / wrong-slot
 *                     │
 *                     ▼ (chassis found)
 *               capacity checks ──► overweight / over-power-budget / too-many-utilities
 *                     │
 *                     ▼ (no errors)
 *               stat sheet + combatRating
 * ```
 *
 * Every error is collected before returning so the mech bay can show the
 * whole list at once; capacity checks run over whichever parts did
 * resolve, and are skipped entirely when the chassis itself is missing
 * since there is no capacity to check against. A loadout with more
 * utilities than slots is still weighed in full.
 */
export function validateLoadout(
  loadout: MechLoadout,
  catalogue: PartCatalogue,
  rating: MechRatingTuning,
  upgrades: UpgradeTuning,
): Result<MechStatSheet, LoadoutError[]> {
  const resolved = resolveLoadout(loadout, catalogue);
  const errors = [...resolved.errors];
  if (resolved.chassis !== undefined) {
    errors.push(
      ...checkCapacity(resolved.chassis, resolved.components, upgrades),
    );
  }
  if (errors.length > 0 || resolved.chassis === undefined) {
    return err(errors);
  }
  return ok(
    buildStatSheet(
      resolved.chassis,
      upgradeLevelOf(loadout, resolved.chassis.id),
      resolved.components,
      rating,
      upgrades,
    ),
  );
}

/**
 * Folds a stat sheet into the auto-resolver's scalar using the tuning
 * weights: a linear sum over armor, mobility, accuracy and firepower,
 * less a penalty for net positive heat, rounded and floored at zero.
 */
export function computeCombatRating(
  stats: Pick<
    PartStats,
    "armor" | "mobility" | "accuracy" | "firepower" | "heat"
  >,
  rating: MechRatingTuning,
): number {
  const raw =
    stats.armor * rating.armorWeight +
    stats.mobility * rating.mobilityWeight +
    stats.accuracy * rating.accuracyWeight +
    stats.firepower * rating.firepowerWeight -
    Math.max(0, stats.heat) * rating.heatPenalty;
  return Math.max(0, Math.round(raw));
}

// ===========================================
// Private Functions: resolve
// ===========================================

/** Looks every slot's id up, recording structural errors as it goes. */
function resolveLoadout(
  loadout: MechLoadout,
  catalogue: PartCatalogue,
): ResolvedLoadout {
  const errors: LoadoutError[] = [];
  const components: FittedPart[] = [];
  let chassis: ChassisPart | undefined;

  for (const slot of SINGLE_PART_SLOTS) {
    const id = loadout[LOADOUT_FIELD_FOR_SLOT[slot]];
    const part = resolvePart(id, slot, catalogue, errors);
    if (part === undefined) {
      continue;
    }
    if (isChassisPart(part)) {
      chassis = part;
    } else {
      components.push({ part, upgradeLevel: upgradeLevelOf(loadout, part.id) });
    }
  }

  for (const id of loadout.utilityIds) {
    const part = resolvePart(id, "utility", catalogue, errors);
    if (part !== undefined) {
      components.push({ part, upgradeLevel: upgradeLevelOf(loadout, part.id) });
    }
  }

  return { chassis, components, errors };
}

/**
 * Finds the part for one slot, or pushes the reason it cannot be used.
 * Returns the part only when it exists and is made for `slot`.
 */
function resolvePart(
  id: PartId,
  slot: PartSlot,
  catalogue: PartCatalogue,
  errors: LoadoutError[],
): MechPart | undefined {
  if (id.trim() === "") {
    errors.push({
      code: "missing-part",
      slot,
      detail: `No part selected for the ${slot} slot.`,
    });
    return undefined;
  }
  const part = catalogue.getPart(id);
  if (part === undefined) {
    errors.push({
      code: "unknown-part",
      slot,
      detail: `No part with id "${id}" exists in the catalogue.`,
    });
    return undefined;
  }
  if (part.slot !== slot) {
    errors.push({
      code: "wrong-slot",
      slot,
      detail: `"${part.name}" is a ${part.slot} part and cannot be fitted to the ${slot} slot.`,
    });
    return undefined;
  }
  return part;
}

/** The upgrade level a loadout records for a part; absent means 0. */
function upgradeLevelOf(loadout: MechLoadout, id: PartId): number {
  return loadout.upgrades?.[id] ?? 0;
}

// ===========================================
// Private Functions: capacity
// ===========================================

/** Weight, power and utility-count checks of fitted parts against the chassis. */
function checkCapacity(
  chassis: ChassisPart,
  components: readonly FittedPart[],
  upgrades: UpgradeTuning,
): LoadoutError[] {
  const errors: LoadoutError[] = [];
  const fitted = sumPartStats(
    components.map((c) => effectivePartStats(c.part, c.upgradeLevel, upgrades)),
  );
  const { maxWeight, powerOutput, utilitySlots } = chassis.capacity;

  if (fitted.weight > maxWeight) {
    errors.push({
      code: "overweight",
      slot: "chassis",
      detail: `Fitted parts weigh ${fitted.weight}t but the ${chassis.name} carries at most ${maxWeight}t.`,
    });
  }

  const balance = powerOutput + fitted.power;
  if (balance < 0) {
    errors.push({
      code: "over-power-budget",
      slot: "chassis",
      detail: `Fitted parts draw ${-fitted.power} power but the ${chassis.name} supplies ${powerOutput}; short by ${-balance}.`,
    });
  }

  const utilities = components.filter((c) => c.part.slot === "utility").length;
  if (utilities > utilitySlots) {
    errors.push({
      code: "too-many-utilities",
      slot: "utility",
      detail: `${utilities} utilities fitted but the ${chassis.name} has ${utilitySlots} utility slots.`,
    });
  }

  return errors;
}

// ===========================================
// Private Functions: stat sheet
// ===========================================

/** Aggregates every part's effective stats and cost into the sheet. */
function buildStatSheet(
  chassis: ChassisPart,
  chassisUpgradeLevel: number,
  components: readonly FittedPart[],
  rating: MechRatingTuning,
  upgrades: UpgradeTuning,
): MechStatSheet {
  const fitted = sumPartStats(
    components.map((c) => effectivePartStats(c.part, c.upgradeLevel, upgrades)),
  );
  const total = sumPartStats([
    effectivePartStats(chassis, chassisUpgradeLevel, upgrades),
    fitted,
  ]);
  const totalCost = components.reduce(
    (sum, c) =>
      sum +
      c.part.cost +
      cumulativeUpgradeCost(c.part, c.upgradeLevel, upgrades),
    chassis.cost +
      cumulativeUpgradeCost(chassis, chassisUpgradeLevel, upgrades),
  );
  return {
    armor: total.armor,
    mobility: total.mobility,
    heat: total.heat,
    accuracy: total.accuracy,
    firepower: total.firepower,
    weight: total.weight,
    powerBalance: chassis.capacity.powerOutput + fitted.power,
    totalCost,
    combatRating: computeCombatRating(total, rating),
    weapons: weaponsOf(components, upgrades),
  };
}

/**
 * The fitted weapon parts as sheet entries, in slot order (#532). A
 * weapon slot whose part carries no `weapon` block is skipped rather
 * than guessed at: that is a content bug, and `parts.test.ts` fails on
 * it rather than letting a rangeless gun reach a mission.
 */
function weaponsOf(
  components: readonly FittedPart[],
  upgrades: UpgradeTuning,
): readonly MechWeapon[] {
  const order = ["arm-weapon", "back-weapon"] as const;
  const weapons: MechWeapon[] = [];
  for (const slot of order) {
    for (const fitted of components) {
      const part = fitted.part;
      if (part.slot !== slot) {
        continue;
      }
      const weapon = part.weapon;
      if (weapon === undefined) {
        continue;
      }
      const stats = effectivePartStats(
        fitted.part,
        fitted.upgradeLevel,
        upgrades,
      );
      weapons.push({
        id: slot,
        name: part.name,
        range: weapon.range,
        accuracy: stats.accuracy,
        firepower: stats.firepower,
        armorPen: weapon.armorPen,
      });
    }
  }
  return weapons;
}

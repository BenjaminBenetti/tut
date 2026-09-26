import type { DamageTag } from "../../content/model/damage-tag";
import type { DamageResistances } from "../../tactical/model/damage-resistance";
import type {
  MechSystems,
  MechTraits,
} from "../../tactical/model/mech-systems";
import type { MechPart } from "../model/mech-part";

/**
 * Aggregates passive fittings independently of weapon damage and upgrade
 * multipliers. A mech that resists anything carries `resist`; one that
 * resists nothing carries no such field, so its systems are what they
 * were before resistances existed.
 */
export function mechSystemsOf(parts: readonly MechPart[]): MechSystems {
  const traits = parts.map((part) => part.traits ?? {});
  const resist = bestResistances(traits);
  const sum = (
    key: "sightBonus" | "braceAccuracy" | "stationaryAccuracy" | "ablativeHits",
  ): number => traits.reduce((total, trait) => total + (trait[key] ?? 0), 0);
  return {
    heatCapacity: Math.max(
      20,
      ...traits.map((trait) => trait.heatCapacity ?? 0),
    ),
    cooling: parts.reduce(
      (total, part) => total + Math.max(0, -part.stats.heat),
      0,
    ),
    idleHeat: parts
      .filter(
        (part) =>
          part.slot !== "legs" &&
          part.slot !== "arm-weapon" &&
          part.slot !== "back-weapon",
      )
      .reduce((total, part) => total + Math.max(0, part.stats.heat), 0),
    movementHeat: parts
      .filter((part) => part.slot === "legs")
      .reduce((total, part) => total + Math.max(0, part.stats.heat), 0),
    sightBonus: sum("sightBonus"),
    braceAccuracy: sum("braceAccuracy"),
    stationaryAccuracy: sum("stationaryAccuracy"),
    jumpRange: Math.max(0, ...traits.map((trait) => trait.jumpRange ?? 0)),
    jumpHeight: Math.max(0, ...traits.map((trait) => trait.jumpHeight ?? 0)),
    jumpHeat: Math.max(0, ...traits.map((trait) => trait.jumpHeat ?? 0)),
    allTerrain: traits.some((trait) => trait.allTerrain),
    energyHeatFactor: Math.min(
      1,
      ...traits.map((trait) => trait.energyHeatFactor ?? 1),
    ),
    ablativeHits: Math.max(
      0,
      ...traits.map((trait) => trait.ablativeHits ?? 0),
    ),
    coolantUses: Math.max(0, ...traits.map((trait) => trait.coolantUses ?? 0)),
    designationAccuracy: Math.max(
      0,
      ...traits.map((trait) => trait.designationAccuracy ?? 0),
    ),
    ablativeAbsorption: Math.max(
      0,
      ...traits.map((trait) => trait.ablativeAbsorption ?? 0),
    ),
    equipment: [...new Set(traits.flatMap((trait) => trait.equipment ?? []))],
    ...(resist === undefined ? {} : { resist }),
  };
}

/**
 * The best resistance any fitted part gives per damage tag (campaign
 * arc §10.2), or undefined when no part resists anything. The best, not
 * the sum, as with ablative absorption: a second plate made for the
 * same hit adds nothing the first did not.
 *
 * ```
 *   [{ acid: 3 }, {}, { acid: 2 }]  ──► { acid: 3 }
 *   [{}, {}]                        ──► undefined
 * ```
 */
function bestResistances(
  traits: readonly MechTraits[],
): DamageResistances | undefined {
  const best: Partial<Record<DamageTag, number>> = {};
  let any = false;
  for (const trait of traits) {
    for (const [tag, points] of Object.entries(trait.resist ?? {}) as [
      DamageTag,
      number | undefined,
    ][]) {
      if (points === undefined || points <= 0) {
        continue;
      }
      best[tag] = Math.max(best[tag] ?? 0, points);
      any = true;
    }
  }
  return any ? best : undefined;
}

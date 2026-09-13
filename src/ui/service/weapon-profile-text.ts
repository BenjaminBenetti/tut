import type { WeaponProfile } from "../../tactical/model/weapon-profile";
import { formatWhole } from "./format";

// ===========================================
// Weapon profile text
// ===========================================

/**
 * One line for a weapon's field numbers, shared by the tactical unit
 * card and the mech bay's Combat block (#1132) so the two print a weapon
 * the same way: the four numbers every weapon has, then the blast, the
 * fire and the force only when the weapon has them (#1121).
 *
 * ```
 *   range 14 · acc 70 · dmg 22 · pen 1 · blast 1 · demo 1
 * ```
 *
 * @param profile - The weapon's field profile.
 * @returns The line, dot-separated.
 */
export function weaponProfileText(profile: WeaponProfile): string {
  const extras = [
    ...(profile.aoe === undefined
      ? []
      : [`blast ${formatWhole(profile.aoe.radius)}`]),
    ...(profile.aoeEffect === undefined ? [] : [profile.aoeEffect.kind]),
    ...((profile.demoForce ?? 0) > 0
      ? [`demo ${formatWhole(profile.demoForce ?? 0)}`]
      : []),
  ];
  return [
    `range ${formatWhole(profile.range)} · acc ${formatWhole(profile.accuracy)} · dmg ${formatWhole(profile.damage)} · pen ${formatWhole(profile.armorPen)}`,
    ...extras,
  ].join(" · ");
}

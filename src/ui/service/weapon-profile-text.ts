import type { WeaponProfile } from "../../tactical/model/weapon-profile";
import { formatWhole } from "./format";

// ===========================================
// Weapon profile text
// ===========================================

/**
 * One line for a weapon's field numbers, shared by the tactical unit
 * card and the mech bay's Combat block (#1132) so the two print a weapon
 * the same way: the four numbers every weapon has, then the blast, the
 * fire and the force only when the weapon has them (#1121), and last
 * the damage tags (campaign arc §10.2), which say what a resistance
 * answers.
 *
 * ```
 *   range 14 · acc 70 · dmg 22 · pen 1 · blast 1 · demo 1
 *   range 6 · acc 60 · dmg 4 · pen 1 · acid
 * ```
 *
 * @param profile - The weapon's field profile.
 * @returns The line, dot-separated.
 */
export function weaponProfileText(profile: WeaponProfile): string {
  const extras = [
    ...(profile.heat === undefined
      ? []
      : [`heat +${formatWhole(profile.heat)}`]),
    ...(profile.minRange ? [`min ${formatWhole(profile.minRange)}`] : []),
    ...(profile.indirect ? ["indirect · allied sight"] : []),
    ...(profile.requiresBrace ? ["requires brace"] : []),
    ...(profile.guided ? ["guided"] : []),
    ...(profile.beam ? ["line beam"] : []),
    ...(profile.cooldown
      ? [`recovery ${formatWhole(profile.cooldown)} turn`]
      : []),
    ...(profile.aoe === undefined
      ? []
      : [`blast ${formatWhole(profile.aoe.radius)}`]),
    ...(profile.aoeEffect === undefined ? [] : [profile.aoeEffect.kind]),
    ...((profile.demoForce ?? 0) > 0
      ? [`demo ${formatWhole(profile.demoForce ?? 0)}`]
      : []),
    ...(profile.tags ?? []),
  ];
  return [
    `range ${formatWhole(profile.range)} · acc ${formatWhole(profile.accuracy)} · dmg ${formatWhole(profile.damage)} · pen ${formatWhole(profile.armorPen)}`,
    ...extras,
  ].join(" · ");
}

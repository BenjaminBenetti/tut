import type { CombatTuning } from "../model/combat-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default combat tuning. Placeholders until M2 is playable end to end:
 *
 * - Point-blank shots fire at the weapon's accuracy; every further tile
 *   costs 1, so a rifle squad (65%) at eight tiles is at 58%. It cost 2
 *   until #1121, when the Executive Director found the arsenal missing
 *   too often in play: at ten tiles the starter mortar went from 42 % to
 *   51 % and the autocannon from 57 % to 66 %. Bugs are melee and never
 *   paid this, so the lift is the player's alone.
 * - Low cover is worth −20, high cover −40; being flanked out of cover
 *   hands the attacker +15; each level of height is ±10, at most ±20.
 * - Distance is measured in three dimensions and a shooter standing a
 *   whole storey above its target reaches 2 tiles further per storey,
 *   at most 6 (#1119). A storey is 1.5 tiles tall, so the bonus more
 *   than covers the height it adds to the distance: high ground buys
 *   reach, and the roof the bug cannot see up to is the place to be.
 * - Nothing is ever below 5% or above 95%.
 * - Damage rolls ±25% around the weapon's value; armor subtracts flat
 *   after penetration; every hit does at least 1.
 * - An attack costs one action. For a mech or a bug it also ends the
 *   turn, so they attack once; an infantry squad's does not, so two
 *   actions buy two attacks, or a move and a shot (GDD §6.2, #533).
 *   Squads felt weak against small bugs and now differ from mechs in
 *   volume of fire rather than in raw numbers.
 */
export const COMBAT_TUNING: CombatTuning = {
  rangePenaltyPerTile: 1,
  coverModifier: { 0: 0, 1: -20, 2: -40 },
  flankBonus: 15,
  elevationPerStorey: 10,
  maxElevationModifier: 20,
  reachBonusPerStorey: 2,
  maxReachBonus: 6,
  minHitChance: 5,
  maxHitChance: 95,
  damageSpread: 0.25,
  minDamage: 1,
  attackApCost: 1,
  attackEndsTurn: {
    squad: false,
    mech: true,
    bug: true,
    turret: true,
    generator: true,
  },
};

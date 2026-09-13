import type { CombatTuning } from "../model/combat-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default combat tuning. Placeholders until M2 is playable end to end:
 *
 * - Point-blank shots fire at the weapon's accuracy; every further tile
 *   costs 2, so a rifle squad (65%) at eight tiles is at 51%.
 * - Low cover is worth −20, high cover −40; being flanked out of cover
 *   hands the attacker +15; each level of height is ±10, at most ±20.
 * - A shot aimed at a tile gets +25 (#1121): the ground does not dodge.
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
  rangePenaltyPerTile: 2,
  coverModifier: { 0: 0, 1: -20, 2: -40 },
  flankBonus: 15,
  // A shot at the ground is a shot at something that stands still
  // (#1121): the starter mortar at ten tiles goes from 42 % to 67 %,
  // which the Executive Director asked for after five misses in a row;
  // at its full sixteen it is still a coin flip and a half.
  groundShotBonus: 25,
  elevationPerStorey: 10,
  maxElevationModifier: 20,
  reachBonusPerStorey: 2,
  maxReachBonus: 6,
  minHitChance: 5,
  maxHitChance: 95,
  damageSpread: 0.25,
  minDamage: 1,
  attackApCost: 1,
  attackEndsTurn: { squad: false, mech: true, bug: true },
};

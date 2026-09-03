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
 * - Nothing is ever below 5% or above 95%.
 * - Damage rolls ±25% around the weapon's value; armor subtracts flat
 *   after penetration; every hit does at least 1.
 * - An attack costs one action and ends the unit's turn (GDD §6.2).
 */
export const COMBAT_TUNING: CombatTuning = {
  rangePenaltyPerTile: 2,
  coverModifier: { 0: 0, 1: -20, 2: -40 },
  flankBonus: 15,
  elevationPerLevel: 10,
  maxElevationModifier: 20,
  minHitChance: 5,
  maxHitChance: 95,
  damageSpread: 0.25,
  minDamage: 1,
  attackApCost: 1,
  attackEndsTurn: true,
};

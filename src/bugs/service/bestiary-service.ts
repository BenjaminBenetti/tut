import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import type { BugSpeciesId } from "../../content/model/bug-species-id";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import { BESTIARY } from "../data/bestiary";
import type { Bestiary, SpeciesDebut } from "../model/bestiary";
import type { SpeciesMix } from "../model/species-mix";

// ===========================================
// Species mix by act
// ===========================================

/**
 * The species mix for an offer made in `act` after `missionsInAct`
 * missions played in it (campaign arc §3 and §8, ADR 0013 §2.6): every
 * rolled species that has debuted and has a positive share in `act`,
 * weighted by that share and renormalised to sum to 1. Placed species
 * never appear.
 *
 * ```
 *   act-1, 0 played   swarmer 60, lurker 25              ──► 60/85, 25/85
 *   act-1, 4 played   + brute 5                          ──► 60/90, 25/90, 5/90
 *   act-1, 7 played   + spitter 10                       ──► 60, 25, 5, 10 (/100)
 *   act-2, 0 played   brute and spitter debuted earlier  ──► 40, 20, 10, 15 (/85)
 *   act-2, 5 played   + burrower 15                      ──► 40, 20, 10, 15, 15 (/100)
 * ```
 *
 * Pure and deterministic: no RNG, and the mix lists species in
 * `BUG_SPECIES_IDS` order so the same inputs always serialise the same.
 * Empty only when no species qualifies, which the shipped table never
 * allows.
 *
 * @param act - The act the offer is made in.
 * @param missionsInAct - Missions resolved since `act` began.
 * @param bestiary - The table to read; the shipped `BESTIARY` by default.
 * @returns Each qualifying species' fraction of the rolled bugs.
 */
export function bugMixFor(
  act: ActId,
  missionsInAct: number,
  bestiary: Bestiary = BESTIARY,
): SpeciesMix {
  const weights: [BugSpeciesId, number][] = [];
  for (const id of BUG_SPECIES_IDS) {
    const entry = bestiary[id];
    if (entry?.kind !== "rolled") {
      continue;
    }
    const share = entry.shares[act];
    if (share > 0 && hasDebuted(entry.debut, act, missionsInAct)) {
      weights.push([id, share]);
    }
  }
  const total = weights.reduce((sum, [, share]) => sum + share, 0);
  const mix: Partial<Record<BugSpeciesId, number>> = {};
  for (const [id, share] of weights) {
    mix[id] = share / total;
  }
  return mix;
}

/**
 * Whether a species with this debut is in the roll for an offer made in
 * `act` after `missionsInAct` missions in it (arc §3): always once its
 * debut act is behind, never while it is ahead, and in its own act from
 * the debut's mission count onwards.
 *
 * ```
 *   debut act earlier than act ──► in
 *   debut act later than act   ──► out
 *   same act                   ──► missionsInAct ≥ debut.missionsInAct
 * ```
 *
 * @param debut - When the species first joins the roll.
 * @param act - The act the offer is made in.
 * @param missionsInAct - Missions resolved since `act` began.
 * @returns True when the species has debuted.
 */
export function hasDebuted(
  debut: SpeciesDebut,
  act: ActId,
  missionsInAct: number,
): boolean {
  const debutOrder = ACT_IDS.indexOf(debut.act);
  const actOrder = ACT_IDS.indexOf(act);
  if (debutOrder !== actOrder) {
    return debutOrder < actOrder;
  }
  return missionsInAct >= debut.missionsInAct;
}

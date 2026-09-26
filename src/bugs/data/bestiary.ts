import type { Bestiary } from "../model/bestiary";

// ===========================================
// Bestiary (campaign arc §8)
// ===========================================

/**
 * Which species the campaign rolls, how much of each per act, and when
 * each one debuts (campaign arc §3 and §8, ADR 0013 §2.6). `bugMixFor`
 * turns it into the species mix frozen on each offer.
 *
 * ```
 *   species   act-1  act-2  act-3  finale   debut
 *   swarmer     60     40     20     15     act-1, first mission (M1)
 *   lurker      25     20     12     10     act-1, first mission (M1)
 *   brute        5     10      8      8     act-1, after 4 played (M5)
 *   spitter     10     15     13     12     act-1, after 7 played (M8)
 * ```
 *
 * Shares are the arc's percentages as written. The arc's other rolled
 * species (the burrower, from act-2 after 5 played, and the armoured
 * variants, from act-3) add their rows when they land; until then a mix
 * renormalises over the species here. The placed bosses (Hive Guard,
 * Broodmother, Sovereign) take a `placed` entry when they land.
 *
 * The brute is held back to M5 so its arrival is an event, and the
 * spitter to M8.
 */
export const BESTIARY: Bestiary = {
  swarmer: {
    kind: "rolled",
    shares: { "act-1": 60, "act-2": 40, "act-3": 20, finale: 15 },
    debut: { act: "act-1", missionsInAct: 0 },
  },
  lurker: {
    kind: "rolled",
    shares: { "act-1": 25, "act-2": 20, "act-3": 12, finale: 10 },
    debut: { act: "act-1", missionsInAct: 0 },
  },
  brute: {
    kind: "rolled",
    shares: { "act-1": 5, "act-2": 10, "act-3": 8, finale: 8 },
    debut: { act: "act-1", missionsInAct: 4 },
  },
  spitter: {
    kind: "rolled",
    shares: { "act-1": 10, "act-2": 15, "act-3": 13, finale: 12 },
    debut: { act: "act-1", missionsInAct: 7 },
  },
};

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
 *   species           act-1  act-2  act-3  finale   debut
 *   swarmer             60     40     20     15     act-1, first mission (M1)
 *   lurker              25     20     12     10     act-1, first mission (M1)
 *   brute                5     10      8      8     act-1, after 4 played (M5)
 *   spitter             10     15     13     12     act-1, after 7 played (M8)
 *   burrower             0     15     12     10     act-2, after 5 played (II+5)
 *   hive-guard        placed: stood by its mission's setup, never rolled
 *   swarmer-armoured     0      0     18     14     act-3, first mission
 *   lurker-armoured      0      0     10      9     act-3, first mission
 *   brute-armoured       0      0      7      7     act-3, first mission
 *                      ───    ───    ───    ───
 *   rolled total       100    100    100     85
 * ```
 *
 * Shares are the arc's percentages as written. The arc's rolled species
 * are all here now, so acts I to III each sum to 100. The finale sums
 * to 85: its other 15 is the Sovereign's escort share (arc §8, footnote),
 * which lands with the Sovereign; until then a finale mix renormalises
 * over the species here. The placed bugs take a `placed` entry: the Hive
 * Guard now, the Broodmother and the Sovereign when they land.
 *
 * The brute is held back to M5 so its arrival is an event, and the
 * spitter to M8. The burrower is Act II's surprise: it holds no share
 * in Act I, and even in Act II it waits five missions, so the first
 * thing to come up out of the floor does so once the squad has learned
 * to read the surface.
 *
 * **Armoured variants** (#1179). The arc gives them 35 of act-3 and 30
 * of the finale together, from the act's first mission. That total is
 * split in proportion to the base species' own shares in the act, so
 * each family arrives armoured about as often as the others (about
 * 47 %); where the split is not whole it is rounded by largest
 * remainder, a tie going to the larger family:
 *
 * ```
 *   act-3   35 × 20:12:8 /40 = 17.5 : 10.5 : 7     ──► 18 : 10 : 7
 *   finale  30 × 15:10:8 /33 = 13.6 :  9.1 : 7.3   ──► 14 :  9 : 7
 * ```
 *
 * The bases are the swarmer, lurker and brute only, so the burrower's
 * row, which lands in the same columns, leaves the split as it was.
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
  burrower: {
    kind: "rolled",
    shares: { "act-1": 0, "act-2": 15, "act-3": 12, finale: 10 },
    debut: { act: "act-2", missionsInAct: 5 },
  },
  // Placed beside the hive core by the Hive Assault's setup (arc §6.5,
  // §7.5), never rolled into a hatch or a wave (ADR 0013 §2.6).
  "hive-guard": { kind: "placed" },
  // The Act III armoured variants (arc §8): the 35 and 30 split across
  // the three in proportion to their bases' act shares (see above).
  "swarmer-armoured": {
    kind: "rolled",
    shares: { "act-1": 0, "act-2": 0, "act-3": 18, finale: 14 },
    debut: { act: "act-3", missionsInAct: 0 },
  },
  "lurker-armoured": {
    kind: "rolled",
    shares: { "act-1": 0, "act-2": 0, "act-3": 10, finale: 9 },
    debut: { act: "act-3", missionsInAct: 0 },
  },
  "brute-armoured": {
    kind: "rolled",
    shares: { "act-1": 0, "act-2": 0, "act-3": 7, finale: 7 },
    debut: { act: "act-3", missionsInAct: 0 },
  },
};

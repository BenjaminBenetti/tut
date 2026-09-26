import type { MissionTuning } from "../model/mission-tuning";
import { GREAT_HIVE_TUNING } from "./great-hive-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default mission tuning:
 *
 * - Difficulty leans on the host city (70 %) more than on global threat
 *   (30 %): a fresh foothold at low threat is a skirmish, an overrun city
 *   late in the campaign a last stand. The act then clamps it into its
 *   band (arc §3).
 * - Maps grow with difficulty: small up to 3, medium from 4, large from 8.
 * - About a third of offers carry a tech carcass worth 10 + 2 × difficulty
 *   tech points (#1171), roughly a quarter of the campaign's tech income
 *   when every one is harvested.
 * - A clearance is offered to a detected city from 20 infestation, or
 *   from 10 in Act I (arc §6.1). A won clearance that leaves its city
 *   under 15 purges it to 0 (the mop-up, arc §5): a win removes about 14,
 *   so without it a city offered at 20 could never be cleared.
 * - Defend-installation missions (#1175) are rolled once a day per region
 *   that holds an installation and whose mean infestation is 40 or more:
 *   5 % a day at the threshold rising to 25 % for an overrun region, so
 *   one turns up every few weeks rather than every few days. They lean
 *   harder on the region than the clearance does (80 % / 20 %) because
 *   the waves are the region's bugs. Waves: 3 plus one per 20 points of
 *   regional infestation, so 5 at the threshold and 8 at the cap.
 * - A Hive Assault (arc §6.5) prices its host city like a clearance
 *   (70 % / 30 %) and then adds the hive's level before the act clamps
 *   it; its map is always the large hive cavern, so it is "large" from
 *   difficulty 1. It pays twice the ordinary tech points: a difficulty-7
 *   assault pays (10 + 3 × 7) × 2 = 62, against 23 for a difficulty-5
 *   clearance.
 * - A crash site (arc §6.3) takes its difficulty like a clearance (70 %
 *   the landing city, landing included, 30 % threat, arc §3); its map
 *   stays small to medium, because the pod's eight-turn clock is
 *   measured on a crater a force can cross (large only at d10, which no
 *   act's band draws for it). Each one seeds 10 at a city in a region
 *   the player has eyes on, four times as likely a clean or low one
 *   (under 20) as a city already deep in it, and from Act II twice as
 *   likely in a region with a working sensor array. It pays its tech
 *   points half again.
 * - A wreck recovery (arc §6.6) is a quick in-and-out to a known spot, so
 *   its map stays small longer: medium from 5, large from 9. Difficulty
 *   weighs the city as the clearance does. A wreck whose city is taken
 *   waits up to 3 days for its offer, as long as the offer itself lasts.
 * - An evacuation (arc §6.4) is offered to a detected city at 25
 *   infestation or more, larger cities more often: a city's weight is
 *   one plus the decades of its population over 100 000, so a town of
 *   80 000 weighs 1, a city of a million 2 and Tokyo about 3.6. It
 *   takes its difficulty like a clearance, on a medium map from 3 (the
 *   groups want buildings to shelter in). It traps 3 groups at d1–3, 4
 *   at d4–6 and 5 from d7, pays 100 credits for each one brought home,
 *   and a saved city lifts the stipend by half for ten days; a lost or
 *   ignored one cuts it by a tenth for ten days.
 */
export const MISSION_TUNING: MissionTuning = {
  difficulty: {
    "infestation-clearance": {
      infestationWeight: 0.7,
      threatWeight: 0.3,
      mediumFromDifficulty: 4,
      largeFromDifficulty: 8,
    },
    "defend-installation": {
      infestationWeight: 0.8,
      threatWeight: 0.2,
      mediumFromDifficulty: 3,
      largeFromDifficulty: 8,
    },
    "hive-assault": {
      infestationWeight: 0.7,
      threatWeight: 0.3,
      mediumFromDifficulty: 1,
      largeFromDifficulty: 1,
    },
    "crash-site": {
      infestationWeight: 0.7,
      threatWeight: 0.3,
      mediumFromDifficulty: 4,
      largeFromDifficulty: 10,
    },
    "wreck-recovery": {
      infestationWeight: 0.7,
      threatWeight: 0.3,
      mediumFromDifficulty: 5,
      largeFromDifficulty: 9,
    },
    evacuation: {
      infestationWeight: 0.7,
      threatWeight: 0.3,
      mediumFromDifficulty: 3,
      largeFromDifficulty: 8,
    },
  },
  techCarcass: {
    chance: 0.35,
    basePoints: 10,
    pointsPerDifficulty: 2,
  },
  clearance: {
    minInfestationByAct: {
      "act-1": 10,
      "act-2": 20,
      "act-3": 20,
      finale: 20,
    },
    mopUpBelow: 15,
  },
  defence: {
    offer: {
      minInfestation: 40,
      chanceAtThreshold: 0.05,
      chanceAtMax: 0.25,
    },
    baseWaves: 3,
    wavesPerInfestationPoint: 0.05,
    maxWaves: 8,
  },
  hiveAssault: {
    techRewardMultiplier: 2,
  },
  greatHive: GREAT_HIVE_TUNING,
  crashSite: {
    landingInfestation: 10,
    lowInfestationBelow: 20,
    lowCityWeight: 4,
    sensorArrayFromAct: "act-2",
    sensorArrayType: "sensor-array",
    sensorArrayWeight: 2,
    techPointMultiplier: 1.5,
  },
  wreck: {
    offerWindowDays: 3,
    stripTurns: 2,
  },
  evacuation: {
    minInfestation: 25,
    populationWeightUnit: 100_000,
    minGroups: 3,
    maxGroups: 5,
    difficultyPerGroup: 3,
    creditsPerGroup: 100,
    savedStipend: { factor: 1.5, days: 10 },
    lostStipend: { factor: 0.9, days: 10 },
  },
};

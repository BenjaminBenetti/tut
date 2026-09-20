import type { MissionTuning } from "../model/mission-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default mission generation tuning. Placeholders until the tick
 * pipeline (#68) is playable end to end:
 *
 * - Infestation clearance is offered once a city reaches 20 infestation,
 *   15 % per day at that threshold rising to 60 % per day for an overrun
 *   city, so a neglected city keeps asking for help.
 * - Difficulty leans on the host city (70 %) more than on global threat
 *   (30 %): a fresh foothold at low threat is a skirmish, an overrun city
 *   late in the campaign a last stand.
 * - Maps grow with difficulty: small up to 3, medium from 4, large from 8.
 * - About a third of missions carry a tech carcass worth 10 + 2 × difficulty
 *   tech points (#1171), roughly a quarter of the campaign's tech income
 *   when every one is harvested.
 * - Defend-installation missions (#1175) are rolled once a day per region
 *   that holds an installation and whose mean infestation is 40 or more:
 *   5 % a day at the threshold rising to 20 % for an overrun region, so
 *   one turns up every few weeks rather than every few days. They lean
 *   harder on the region than the clearance does (80 % / 20 %) because
 *   the waves are the region's bugs. Waves: 3 plus one per 20 points of
 *   regional infestation, so 5 at the threshold and 8 at the cap.
 */
export const MISSION_TUNING: MissionTuning = {
  rules: {
    "infestation-clearance": {
      trigger: "city-infestation",
      minInfestation: 20,
      chanceAtThreshold: 0.15,
      chanceAtMax: 0.6,
      infestationWeight: 0.7,
      threatWeight: 0.3,
      mediumFromDifficulty: 4,
      largeFromDifficulty: 8,
    },
    "defend-installation": {
      trigger: "region-installation",
      minInfestation: 40,
      chanceAtThreshold: 0.05,
      chanceAtMax: 0.25,
      infestationWeight: 0.8,
      threatWeight: 0.2,
      mediumFromDifficulty: 3,
      largeFromDifficulty: 8,
    },
  },
  techCarcass: {
    chance: 0.35,
    basePoints: 10,
    pointsPerDifficulty: 2,
  },
  defence: {
    baseWaves: 3,
    wavesPerInfestationPoint: 0.05,
    maxWaves: 8,
  },
};

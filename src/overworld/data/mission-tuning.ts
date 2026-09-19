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
 */
export const MISSION_TUNING: MissionTuning = {
  rules: {
    "infestation-clearance": {
      minInfestation: 20,
      chanceAtThreshold: 0.15,
      chanceAtMax: 0.6,
      infestationWeight: 0.7,
      threatWeight: 0.3,
      mediumFromDifficulty: 4,
      largeFromDifficulty: 8,
    },
  },
  techCarcass: {
    chance: 0.35,
    basePoints: 10,
    pointsPerDifficulty: 2,
  },
};

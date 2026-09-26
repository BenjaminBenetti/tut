import type { CivilianTuning } from "../model/civilian";

// ===========================================
// Civilian tuning
// ===========================================

/**
 * The civilian group an evacuation frees (campaign arc §6.4). Ten hit
 * points at no armour: a swarmer's bite takes three, so a lone group
 * caught in the open survives about two bug turns and one escorted group
 * survives the walk. Four tiles an action and two actions, a squad's
 * pace, so a group keeps up with the unit that freed it.
 */
export const CIVILIAN_TUNING: CivilianTuning = {
  name: "Civilians",
  maxHp: 10,
  armor: 0,
  move: 4,
  maxAp: 2,
  sightRange: 4,
  modelId: "civ.group",
};

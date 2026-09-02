import type { MissionType } from "../model/mission-type";
import type { MissionTypeId } from "../model/mission-type-id";

// ===========================================
// Mission types (GDD §5.4)
// ===========================================
//
// Numbers are M1 placeholder tuning, chosen against the economy defaults
// (starting credits 5000, base stipend 500/day, rifle squad 500):
//
//   • rewardPerDifficulty 300 → a difficulty-5 clearance pays 1500,
//     roughly three days of full stipend or three fresh rifle squads.
//   • expiryDays 5 is the base; generation (#61) adds an intel bonus.
//   • ignorePenalty 10 is on the 0–100 city infestation scale; new
//     campaigns seed cities at 10–30, so ignoring a mission hurts but is
//     not fatal on its own.

/** The baseline M1 mission: destroy the egg spawners in an infested city. */
export const INFESTATION_CLEARANCE: MissionType = {
  id: "infestation-clearance",
  name: "Infestation Clearance",
  description:
    "Bugs have seeded a city with egg spawners. Deploy, destroy every spawner, and extract before the swarm digs in.",
  difficultyBand: { min: 1, max: 10 },
  rewardPerDifficulty: 300,
  expiryDays: 5,
  ignorePenalty: 10,
  requiredHooks: [],
};

/**
 * Every mission type keyed by id. Typed as a record over the closed
 * `MissionTypeId` union so a new id without a definition (or a definition
 * whose key and `id` disagree, see the data test) fails at compile time
 * rather than at runtime.
 */
export const MISSION_TYPES: Readonly<Record<MissionTypeId, MissionType>> = {
  "infestation-clearance": INFESTATION_CLEARANCE,
};

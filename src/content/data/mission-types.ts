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
//   • techRewardBase 8 + techRewardPerDifficulty 3 → a difficulty-5
//     clearance pays 23 tech points, so the 728-point tech tree spans
//     about 25 missions on the campaign's difficulty ramp (#1171; the
//     pacing check lives in tech/data/tech-tree.test.ts).
//   • expiryDays 5 is the base; generation (#61) adds an intel bonus.
//   • ignorePenalty 10 is on the 0–100 city infestation scale; new
//     campaigns seed cities at 10–30, so ignoring a mission hurts but is
//     not fatal on its own.
//   • requiredHooks: 2 egg spawners at difficulty 1 growing to 4 at 10,
//     2 edge spawn zones growing to 3, always one deploy and extraction.

/** The baseline M1 mission: destroy the egg spawners in an infested city. */
export const INFESTATION_CLEARANCE: MissionType = {
  id: "infestation-clearance",
  name: "Infestation Clearance",
  description:
    "Bugs have seeded a city with egg spawners. Deploy, destroy every spawner, and extract before the swarm digs in.",
  difficultyBand: { min: 1, max: 10 },
  rewardPerDifficulty: 300,
  techRewardBase: 8,
  techRewardPerDifficulty: 3,
  expiryDays: 5,
  ignorePenalty: 10,
  requiredHooks: [
    { kind: "deploy", count: 1 },
    { kind: "egg-spawner", count: 2, countPerDifficulty: 0.25 },
    { kind: "edge-spawn", count: 2, countPerDifficulty: 0.2 },
    { kind: "extraction", count: 1 },
  ],
  mapSize: "medium",
};

/**
 * The first M3 type (#1175): waves of bugs against the generators of an
 * installation the player built (GDD §5.4, §5.6). The generators come
 * from the offer rather than from here — `Mission.defence` says how
 * many, read from the installation's site — so the hook list names only
 * what every defend map shares: a deploy zone, edge spawn zones for the
 * waves (three at difficulty 1 growing to four at 6, so a late wave can
 * come from a third side) and the extraction. No egg spawners: the
 * threat walks in from the edge on the clock, it does not hatch.
 *
 * Numbers against the clearance: the same credits per difficulty and
 * a little more tech, since the bugs come to the force and every one is
 * a carcass; a shorter expiry, because the installation is under threat
 * now; a heavier ignore penalty, since a region the bugs push into
 * unopposed is one they dig into.
 */
export const DEFEND_INSTALLATION: MissionType = {
  id: "defend-installation",
  name: "Defend Installation",
  description:
    "The swarm is moving on an installation you built. Hold the generators through every wave, then bring the force home.",
  difficultyBand: { min: 1, max: 10 },
  rewardPerDifficulty: 300,
  techRewardBase: 10,
  techRewardPerDifficulty: 3,
  expiryDays: 3,
  ignorePenalty: 15,
  requiredHooks: [
    { kind: "deploy", count: 1 },
    { kind: "edge-spawn", count: 3, countPerDifficulty: 0.2 },
    { kind: "extraction", count: 1 },
  ],
  mapSize: "medium",
};

/**
 * Every mission type keyed by id. Typed as a record over the closed
 * `MissionTypeId` union so a new id without a definition (or a definition
 * whose key and `id` disagree, see the data test) fails at compile time
 * rather than at runtime.
 */
export const MISSION_TYPES: Readonly<Record<MissionTypeId, MissionType>> = {
  "infestation-clearance": INFESTATION_CLEARANCE,
  "defend-installation": DEFEND_INSTALLATION,
};

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
//   • techRewardBase 5 + techRewardPerDifficulty 2 → a difficulty-5
//     clearance pays 15 tech points. Paced against the whole campaign
//     (campaign arc §10, #1171): the 728 points of part nodes are paid
//     for by about mission 35, and the whole tree costs 1.3–1.6× what an
//     Average campaign earns. At 8 + 3 the parts were paid for by about
//     mission 25, and an Average campaign earned 94% of the tree. The model
//     check lives in tech/data/tech-tree.test.ts, the measurement in the
//     campaign sweep (app/service/campaign-sweep.sim.test.ts).
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
  techRewardBase: 5,
  techRewardPerDifficulty: 2,
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
  techRewardBase: 7,
  techRewardPerDifficulty: 2,
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
 * A spore pod come down in open ground near a city (campaign arc §6.3):
 * destroy it before it matures at the end of turn 8, then extract. The
 * map is the crash-site crater, so the hooks are the pod on the crater
 * floor, two edge spawn zones that stay two (the pod and its clock are
 * the pressure, not the waves), a deploy zone and the extraction. No
 * egg spawners.
 *
 * Numbers against the clearance: the same credits and the same tech
 * base; the overworld's crash-site tuning pays the tech half again
 * (arc §6.3: "high TP, a TP reward ×1.5"), frozen on the offer. A
 * shorter expiry than the clearance, because a pod on the ground is on
 * a clock; its ignore penalty is the landing taking root (arc §6.3:
 * "+15 on the city"), which the consequence rule also applies to a lost
 * crash site.
 */
export const CRASH_SITE: MissionType = {
  id: "crash-site",
  name: "Crash Site",
  description:
    "A spore pod has come down near a city. Reach the crater, destroy the pod before it matures at the end of turn 8, then extract.",
  difficultyBand: { min: 1, max: 10 },
  rewardPerDifficulty: 300,
  techRewardBase: 5,
  techRewardPerDifficulty: 2,
  expiryDays: 4,
  ignorePenalty: 15,
  requiredHooks: [
    { kind: "deploy", count: 1 },
    { kind: "spore-pod", count: 1 },
    { kind: "edge-spawn", count: 2 },
    { kind: "extraction", count: 1 },
  ],
  mapSize: "medium",
};

/**
 * The event offer a destroyed mech leaves behind (arc §6.6, D6): a
 * mech went down on a lost or abandoned mission, and its wreck still
 * lies where it fell. An infantry squad strips it over two turns and
 * carries the parts home; the offer is triggered, never drawn, and
 * gives one attempt.
 *
 * It pays parts only — the lost mech's fitted parts, back in the
 * inventory — so the credit and tech rewards are zero and the chassis
 * and the pilot's rank stay lost. It expires in three days, and leaving
 * it costs nothing but the parts: the city is no worse for a wreck
 * nobody went back for.
 *
 * The hook list is the settlement's usual threat at a modest count (one
 * egg spawner, a second from difficulty 7; two edge spawn zones) around
 * a deploy zone and the extraction. The wreck's own hook comes from the
 * type's map rule, which sizes it to the lost chassis.
 */
export const WRECK_RECOVERY: MissionType = {
  id: "wreck-recovery",
  name: "Wreck Recovery",
  description:
    "A mech went down and its wreck still lies where it fell. Reach it, have an infantry squad strip its parts over two turns, and bring them home.",
  difficultyBand: { min: 1, max: 10 },
  rewardPerDifficulty: 0,
  techRewardBase: 0,
  techRewardPerDifficulty: 0,
  expiryDays: 3,
  ignorePenalty: 0,
  requiredHooks: [
    { kind: "deploy", count: 1 },
    { kind: "egg-spawner", count: 1, countPerDifficulty: 0.15 },
    { kind: "edge-spawn", count: 2 },
    { kind: "extraction", count: 1 },
  ],
  mapSize: "medium",
};

/**
 * Civilians trapped in an infested city (campaign arc §6.4): free the
 * groups holed up in its buildings, walk at least half of them to the
 * drop ship, and extract. The map is a settlement, and the civilian
 * hooks, one per group, come from the offer (`Mission.evacuation`) by
 * way of the map rule, so the hook list here names only the rest: a
 * deploy zone, a modest egg-spawner count (one, growing to two at
 * difficulty 6; the groups the bugs hunt are the pressure, not the
 * nests), two edge spawn zones and the extraction.
 *
 * Numbers against the clearance: the same credits per difficulty, of
 * which the per-group extra and the stipend bonus are the larger part
 * (the overworld's evacuation tuning pays them); less tech, since the
 * squad escorts rather than kills; a shorter expiry, since the people
 * are trapped now. No infestation penalty: an evacuation left alone
 * costs the stipend (−10% for 10 days, arc §6.4), which the
 * consequence rule applies, not the city.
 */
export const EVACUATION: MissionType = {
  id: "evacuation",
  name: "Evacuation",
  description:
    "Civilians are trapped in an infested city. Free the groups holed up in its buildings, walk them to the drop ship, and extract.",
  difficultyBand: { min: 1, max: 10 },
  rewardPerDifficulty: 300,
  techRewardBase: 3,
  techRewardPerDifficulty: 1,
  expiryDays: 4,
  ignorePenalty: 0,
  requiredHooks: [
    { kind: "deploy", count: 1 },
    { kind: "egg-spawner", count: 1, countPerDifficulty: 0.2 },
    { kind: "edge-spawn", count: 2 },
    { kind: "extraction", count: 1 },
  ],
  mapSize: "medium",
};

/**
 * The assault on a hive (campaign arc §6.5): one pinned offer per hive,
 * fought in a hive cavern. Destroy the hive core in the deepest chamber,
 * then bring the squad back out through the cavern mouth.
 *
 * Numbers against the clearance: the same credits per difficulty; tech
 * starts from the defence's base and the hive-assault tuning multiplies
 * the whole award (`MISSION_TUNING.hiveAssault`), because a hive is the
 * richest harvest in the campaign. The expiry and the ignore penalty
 * are never read: the offer is pinned while its hive stands, so it
 * never expires, and a hive left alone already costs its region every
 * day through growth. The map is large, and the hook list is the one
 * the cavern needs — the mission-map rule hands mapgen the cavern's own
 * hook list (`HIVE_CAVERN_HOOKS`), so this list is what the content
 * contract checks (deploy, the core, extraction).
 */
export const HIVE_ASSAULT: MissionType = {
  id: "hive-assault",
  name: "Hive Assault",
  description:
    "A hive has dug in beneath the region. Push into the cavern, destroy the hive core in its deepest chamber, and get the squad back out.",
  difficultyBand: { min: 1, max: 10 },
  rewardPerDifficulty: 300,
  techRewardBase: 7,
  techRewardPerDifficulty: 2,
  expiryDays: 7,
  ignorePenalty: 0,
  requiredHooks: [
    { kind: "deploy", count: 1 },
    { kind: "hive-core", count: 1 },
    { kind: "egg-spawner", count: 3 },
    { kind: "edge-spawn", count: 2 },
    { kind: "extraction", count: 1 },
  ],
  mapSize: "large",
};

/**
 * A city at the spread threshold is tunnelling toward its neighbour
 * (arc §6.7): set a charge on each of the three tunnel mouths, survive
 * the three-turn fuses, then extract. A win holds the city's spread for
 * 10 days; the overworld's offer and consequence rules say how.
 *
 * Numbers against the clearance, the arc's "ordinary" scale: the same
 * credits per difficulty and the same tech. The pay-off is the held
 * spread, not a bonus. Its expiry is not this number: the offer lasts
 * until the spread is due (at most 2 days, the offer window), so
 * `expiryDays` is only the ceiling a caller without the spec reads. It
 * carries no ignore penalty, because ignoring it already costs the
 * spread (arc §6.7: "the spread happens as normal").
 *
 * The hook list is the settlement's modest threat: two edge spawn zones
 * and no egg spawners (the open mouths are the mission's spawners,
 * surfacing burrowers), around a deploy zone and the extraction. The
 * three mouths come from the type's map rule.
 */
export const TUNNEL_SABOTAGE: MissionType = {
  id: "tunnel-sabotage",
  name: "Tunnel Sabotage",
  description:
    "The swarm is tunnelling toward the next city. Set a charge on each of the three tunnel mouths, hold while the fuses burn, then extract.",
  difficultyBand: { min: 1, max: 10 },
  rewardPerDifficulty: 300,
  techRewardBase: 5,
  techRewardPerDifficulty: 2,
  expiryDays: 2,
  ignorePenalty: 0,
  requiredHooks: [
    { kind: "deploy", count: 1 },
    { kind: "edge-spawn", count: 2 },
    { kind: "extraction", count: 1 },
  ],
  mapSize: "medium",
};

/**
 * A named Broodmother is laying clutches across a region (campaign arc
 * §6.8): kill her before she reaches the map edge, then extract. She is
 * placed by the type's setup, lays a new egg spawner every three turns
 * and runs for the edge at half health; one who gets away comes back
 * stronger as a nemesis.
 *
 * Numbers against the clearance:
 *   • the ordinary credit and tech scale (300 per difficulty, 5 + 2 per
 *     difficulty, the clearance's since the campaign retune; it was
 *     8 + 3). There is no separate bounty on a nemesis: her level
 *     adds a difficulty step to the hunt, which pays 300 credits and
 *     2 TP more per level, and the Broodmother autopsy her first kill
 *     unlocks is the real prize (arc §6.8, §10);
 *   • a shorter expiry (4 days): she is on the move, as a pod is;
 *   • an ignore penalty of 15, the crash site's and the defence's: a
 *     Broodmother nobody hunts lays unopposed in the city. Ignoring her
 *     costs nothing else: an offer that lapses leaves no scar and no
 *     nemesis level, since nobody met her;
 *   • fewer egg spawners than a clearance: one, a second from
 *     difficulty 6 (the clearance has three by then). Her clutches are
 *     the pressure, not the map's nests. Two edge spawn zones that stay
 *     two, as the crash site's do.
 */
export const ALPHA_HUNT: MissionType = {
  id: "alpha-hunt",
  name: "Alpha Hunt",
  description:
    "A Broodmother is laying clutches across the region. Kill her before she reaches the map edge, then extract.",
  difficultyBand: { min: 1, max: 10 },
  rewardPerDifficulty: 300,
  techRewardBase: 5,
  techRewardPerDifficulty: 2,
  expiryDays: 4,
  ignorePenalty: 15,
  requiredHooks: [
    { kind: "deploy", count: 1 },
    { kind: "egg-spawner", count: 1, countPerDifficulty: 0.2 },
    { kind: "edge-spawn", count: 2 },
    { kind: "extraction", count: 1 },
  ],
  mapSize: "medium",
};

/**
 * The finale (campaign arc §6.9): the assault on the Spore Platform,
 * played as two linked maps (ADR 0013 amendment, #1179). The squad
 * boards at the hull's docking ring and fights to the hatch; whoever
 * gets through goes straight on into the core chamber, with no repairs,
 * no re-arm and no swaps, and destroys the platform core the Sovereign
 * guards. Only ever pinned by the story, never drawn.
 *
 * Numbers: the finale band's top, d10, for the one fight it is (arc §3:
 * story missions use fixed difficulties, the finale's band is d8–10).
 * No credits and no tech: a win ends the campaign in victory, and a
 * loss pays nothing, so a reward could never be spent. The expiry and
 * the ignore penalty are never read, because a pinned offer never
 * lapses; they are the clearance's so the type stays ordinary data.
 *
 * `requiredHooks` names the hull's hooks in content vocabulary for the
 * readers that list them. The map rule replaces them with each stage's
 * own board and hook list (`spore-platform-hull`, then
 * `spore-platform-core`), so the adapter never scales these.
 */
export const SPORE_PLATFORM: MissionType = {
  id: "spore-platform",
  name: "Spore Platform",
  description:
    "The platform hangs over the Earth. Board its hull, fight through to the hatch, then destroy the core the Sovereign guards. No repairs between the two.",
  difficultyBand: { min: 10, max: 10 },
  rewardPerDifficulty: 0,
  techRewardBase: 0,
  techRewardPerDifficulty: 0,
  expiryDays: 5,
  ignorePenalty: 0,
  requiredHooks: [
    { kind: "deploy", count: 1 },
    { kind: "docking-ring", count: 1 },
    { kind: "platform-exit", count: 1 },
    { kind: "egg-spawner", count: 3 },
    { kind: "edge-spawn", count: 2 },
    { kind: "extraction", count: 1 },
  ],
  mapSize: "large",
  stages: [
    { id: "hull", name: "The hull" },
    { id: "core", name: "The core" },
  ],
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
  "crash-site": CRASH_SITE,
  "wreck-recovery": WRECK_RECOVERY,
  evacuation: EVACUATION,
  "hive-assault": HIVE_ASSAULT,
  "tunnel-sabotage": TUNNEL_SABOTAGE,
  "alpha-hunt": ALPHA_HUNT,
  "spore-platform": SPORE_PLATFORM,
};

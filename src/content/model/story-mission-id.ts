// ===========================================
// Story mission id
// ===========================================

/**
 * The scripted missions of the story spine (campaign arc §6.9, ADR 0013
 * §2.2). Shared vocabulary: an overworld offer carries one as
 * `Mission.storyId`, and map generation, tactical setup and the briefing
 * each key their story content by it. A closed union so a table keyed by
 * it must name every story mission.
 *
 * | Story mission    | Act      | What it is                                   |
 * |------------------|----------|----------------------------------------------|
 * | `first-skyfall`  | I        | the scripted first Crash Site                |
 * | `live-specimen`  | I → II   | capture a lurker and extract; opens Act II   |
 * | `intact-pod`     | II → III | keep a pod alive to recovery; opens Act III  |
 * | `uplink`         | III      | defend a tracking array; reveals Great Hives |
 * | `great-hive`     | III      | one of the three Great Hive assaults         |
 * | `launch-window`  | finale   | defend the launch site                       |
 * | `spore-platform` | finale   | the two-map platform assault; the win        |
 */
export type StoryMissionId =
  | "first-skyfall"
  | "live-specimen"
  | "intact-pod"
  | "uplink"
  | "great-hive"
  | "launch-window"
  | "spore-platform";

/** Every story mission id, in the order the story reaches them. */
export const STORY_MISSION_IDS: readonly StoryMissionId[] = [
  "first-skyfall",
  "live-specimen",
  "intact-pod",
  "uplink",
  "great-hive",
  "launch-window",
  "spore-platform",
];

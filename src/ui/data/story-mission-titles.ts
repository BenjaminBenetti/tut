import type { StoryMissionId } from "../../content/model/story-mission-id";

// ===========================================
// Story mission titles
// ===========================================

/**
 * The name each story mission goes by on the offer board and in the
 * briefing (campaign arc §6.9). A story offer is built on an ordinary
 * mission type, so without its title it reads as one more crash site
 * or clearance. Keyed by the closed `StoryMissionId` union, so a new
 * story mission without a title fails to compile.
 */
export const STORY_MISSION_TITLES: Readonly<Record<StoryMissionId, string>> = {
  "first-skyfall": "First Skyfall",
  "live-specimen": "Live Specimen",
  "intact-pod": "Intact Pod",
  uplink: "Uplink",
  "great-hive": "Great Hive",
  "launch-window": "Launch Window",
  "spore-platform": "Spore Platform",
};

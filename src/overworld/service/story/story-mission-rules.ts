import type { StoryMissionRules } from "../../model/story-mission-rule";
import { FIRST_SKYFALL } from "./first-skyfall";
import { LIVE_SPECIMEN } from "./live-specimen";

// ===========================================
// The table
// ===========================================

/**
 * The story missions that are built (campaign arc §6.9, ADR 0013 §2.5),
 * one module each under `overworld/service/story/`. This file only lists
 * them; the mission director pins them and the launch handler resolves
 * them through the story service.
 *
 * ```
 *   first-skyfall   ──► first-skyfall.ts   Act I, the second mission: a d1 crash site
 *   live-specimen   ──► live-specimen.ts   Act I's ending: a d3 clearance, pinned by
 *                                          Intel I, won by bringing a lurker home
 * ```
 *
 * `Partial` on purpose: story missions land package by package, and an
 * absent entry means "not built yet". The spine reads absence as data:
 * an act exists only once the mission that ends it is here
 * (`STORY_SPINE`), and `advance-act` past the last act that exists wins
 * the campaign. So every build ends in a campaign that can be finished
 * (arc §13). Live Specimen ends Act I; Act II exists only once Intact
 * Pod is built, so until then a won Live Specimen wins the campaign.
 *
 * The composition root passes it to the day tick (pinning) and the
 * launch handler (resolution); tests substitute their own.
 */
export const STORY_MISSION_RULES: StoryMissionRules = {
  "first-skyfall": FIRST_SKYFALL,
  "live-specimen": LIVE_SPECIMEN,
};

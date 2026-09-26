import type { StoryMissionRules } from "../../model/story-mission-rule";
import { FIRST_SKYFALL } from "./first-skyfall";

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
 *   live-specimen   ──► arrives with the capture package
 * ```
 *
 * `Partial` on purpose: story missions land package by package, and an
 * absent entry means "not built yet". The spine reads absence as data:
 * an act exists only once the mission that ends it is here
 * (`STORY_SPINE`), and `advance-act` past the last act that exists wins
 * the campaign. So every build ends in a campaign that can be finished
 * (arc §13). First Skyfall ends no act, so until Live Specimen is built
 * the campaign stays in Act I and ends only in defeat.
 *
 * The composition root passes it to the day tick (pinning) and the
 * launch handler (resolution); tests substitute their own.
 */
export const STORY_MISSION_RULES: StoryMissionRules = {
  "first-skyfall": FIRST_SKYFALL,
};

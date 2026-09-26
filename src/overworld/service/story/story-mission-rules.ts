import { NEMESIS_LORE } from "../../data/nemesis-lore";
import type { StoryMissionRules } from "../../model/story-mission-rule";
import { createBroodmotherSighting } from "./broodmother-sighting";
import { FIRST_SKYFALL } from "./first-skyfall";
import { INTACT_POD } from "./intact-pod";
import { LAUNCH_WINDOW } from "./launch-window";
import { LIVE_SPECIMEN } from "./live-specimen";
import { SPORE_PLATFORM } from "./spore-platform";
import { UPLINK } from "./uplink";

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
 *   intact-pod      ──► intact-pod.ts      Act II's ending: a d6 crash site, pinned by
 *                                          Intel II, won by keeping the pod alive
 *                                          until the recovery drop
 *   uplink          ──► uplink.ts          Act III's opener: hold the tracking array, d6
 *   launch-window   ──► launch-window.ts   Act III's ending: hold the launch site, d8
 *   broodmother-    ──► broodmother-       Act II's side beat: the first Alpha Hunt, d5,
 *     sighting            sighting.ts        pinned ten missions in, in a hive region
 *   spore-platform  ──► spore-platform.ts  the finale: the hull, then the core, d10;
 *                                          won is victory, lost twice is defeat (D7)
 * ```
 *
 * `Partial` on purpose: story missions land package by package, and an
 * absent entry means "not built yet". The spine reads absence as data:
 * an act exists only once the mission that ends it is here
 * (`STORY_SPINE`), and `advance-act` past the last act that exists wins
 * the campaign. So every build ends in a campaign that can be finished
 * (arc §13). Live Specimen ends Act I and Intact Pod ends Act II, so a
 * won Live Specimen enters Act II; Launch Window ends Act III, so a won
 * Intact Pod enters Act III; the Spore Platform ends the finale, so a
 * won Launch Window enters the finale, and a won platform wins the
 * campaign.
 *
 * The composition root passes it to the day tick (pinning) and the
 * launch handler (resolution); tests substitute their own.
 */
export const STORY_MISSION_RULES: StoryMissionRules = {
  "first-skyfall": FIRST_SKYFALL,
  "live-specimen": LIVE_SPECIMEN,
  uplink: UPLINK,
  "launch-window": LAUNCH_WINDOW,
  "intact-pod": INTACT_POD,
  "broodmother-sighting": createBroodmotherSighting(NEMESIS_LORE),
  "spore-platform": SPORE_PLATFORM,
};

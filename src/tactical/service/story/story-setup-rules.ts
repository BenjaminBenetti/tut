import type { StorySetupRules } from "../../model/story-setup-rule";
import { INTACT_POD_TUNING } from "../../data/intact-pod-tuning";
import { createIntactPodSetup } from "./intact-pod-setup";
import { LIVE_SPECIMEN_SETUP } from "./live-specimen-setup";

// ===========================================
// The table
// ===========================================

/**
 * What each story mission adds to its map on top of its type's setup
 * (ADR 0013 §2.5), one module each under `tactical/service/story/`. This
 * file only lists them; the mission start runs the entry for
 * `mission.storyId` right after the type's `MISSION_SETUP_RULES` entry.
 *
 * ```
 *   first-skyfall  ──► (none: the crash site's setup is the whole of it)
 *   live-specimen  ──► live-specimen-setup.ts   the capture decides, the nests are
 *                                               optional, two lurkers by the nests
 *   intact-pod     ──► intact-pod-setup.ts      the pod to burn becomes a pod of
 *                                               ours to keep until the drop
 * ```
 *
 * `Partial` on purpose: a story mission needs an entry only when its
 * type's setup is not the whole of it. The composition root passes it
 * through `MissionStartDeps.storySetupRules`; tests substitute their own.
 */
export const STORY_SETUP_RULES: StorySetupRules = {
  "live-specimen": LIVE_SPECIMEN_SETUP,
  "intact-pod": createIntactPodSetup(INTACT_POD_TUNING),
};

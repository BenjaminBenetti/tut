import type { StoryMissionId } from "../../../content/model/story-mission-id";
import type { GreatPodSetupTuning } from "../../model/great-pod-setup-tuning";
import type { StorySetupRule } from "../../model/story-setup-rule";
import { placeGreatPod } from "../missions/great-pod-setup";

// ===========================================
// Rule
// ===========================================

/**
 * A crash-site story fought on a great pod (#1238), on top of its crash
 * site's setup. The story's map is the great pod's (`STORY_MAP_RULES`),
 * which has no spore pod, so the crash site's setup stood no pod and
 * left the edges their `podEdgeWaves`; this rule stands the pod's core,
 * its clock and its broods.
 *
 * ```
 *   the crash site's setup has run: no pod, edgeSpawn.totalWaves = podEdgeWaves
 *   placeGreatPod ──► the core + destroy-pod on the pod's clock + the broods
 *   no core on the map ──► refused (map-recipe)
 * ```
 *
 * Built per story, so giving the great pod to another crash-site story
 * is one entry in `STORY_SETUP_RULES` and one in `STORY_MAP_RULES`.
 *
 * @param storyId - The story it sets up; equal to its table key.
 * @param tuning - The core, the hull's turns and the broods.
 * @returns The rule.
 */
export function createGreatPodStorySetup(
  storyId: StoryMissionId,
  tuning: GreatPodSetupTuning,
): StorySetupRule {
  return {
    storyId,
    /** The pod's core, its clock and its broods. */
    setup(state, map, mission, deps) {
      return placeGreatPod(state, map, mission, deps, tuning);
    },
  };
}

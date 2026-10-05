import type { MissionType } from "../../../content/model/mission-type";
import type { StoryMissionId } from "../../../content/model/story-mission-id";
import type { Mission } from "../../../overworld/model/mission";
import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";
import { GREAT_POD_MAP_RULE } from "./great-pod-map";

// ===========================================
// Story map rules
// ===========================================

/**
 * The story missions fought on a map of their own rather than their
 * type's (#1238), one rule each. A story offer keeps its type's
 * `typeId`, so an entry here is a rule of that type; `withStoryMaps`
 * sends the story to it and every other offer of the type to the type's
 * own rule.
 *
 * ```
 *   first-skyfall  ──► GREAT_POD_MAP_RULE   the pod came down whole: breach it
 * ```
 *
 * `Partial` on purpose: a story needs an entry only when its type's map
 * is not the whole of it. Giving the great pod to another crash-site
 * story is one entry here.
 */
export const STORY_MAP_RULES: Readonly<
  Partial<Record<StoryMissionId, MissionMapRule>>
> = {
  "first-skyfall": GREAT_POD_MAP_RULE,
};

// ===========================================
// Decorator
// ===========================================

/**
 * `ordinary` — a type's map rule — with each story that has a rule of
 * the same type in `stories` sent to that rule instead. An offer without
 * a `storyId`, or whose story has no rule of this type, is planned by
 * `ordinary` exactly as before.
 *
 * ```
 *   stories[mission.storyId]?.typeId === ordinary.typeId
 *     ? stories[mission.storyId].recipe(mission)  :  ordinary.recipe(mission)
 * ```
 *
 * @param ordinary - The type's own rule.
 * @param stories - Story rules by story id; the shipped table by default.
 * @returns A rule of the same type.
 */
export function withStoryMaps(
  ordinary: MissionMapRule,
  stories: Readonly<
    Partial<Record<StoryMissionId, MissionMapRule>>
  > = STORY_MAP_RULES,
): MissionMapRule {
  return {
    typeId: ordinary.typeId,

    /** The story's own plan when it has one of this type, the type's plan otherwise. */
    recipe(mission: Mission, type: MissionType): MissionMapPlan {
      const story =
        mission.storyId === undefined ? undefined : stories[mission.storyId];
      return story !== undefined && story.typeId === ordinary.typeId
        ? story.recipe(mission, type)
        : ordinary.recipe(mission, type);
    },
  };
}

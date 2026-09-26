import type { Result } from "../../core/model/result";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Mission } from "../../overworld/model/mission";
import type { MissionSetupDeps } from "./mission-setup-rule";
import type { TacticalError } from "./tactical-error";
import type { TacticalState } from "./tactical-state";

// ===========================================
// Rule
// ===========================================

/**
 * What one story mission adds to its map at the start, on top of the
 * mission type it is built on (ADR 0013 §2.5). A story offer keeps its
 * type's `typeId`, so the type's setup rule runs first and stands up
 * what every mission of that type has; the story rule for
 * `mission.storyId` then runs on its result and adds what only the story
 * has.
 *
 * ```
 *   startTacticalMission
 *     MISSION_SETUP_RULES[mission.typeId].setup(base, …)   the type: a clearance's nests
 *     STORY_SETUP_RULES[mission.storyId]?.setup(typed, …)  the story: Live Specimen's
 *                                                          capture and its lurkers
 * ```
 *
 * A story mission without an entry (First Skyfall) is its type's setup
 * alone. Pure and deterministic, like `MissionSetupRule`: ids come from
 * `deps.ids` in the order the rule asks for them.
 */
export interface StorySetupRule {
  /** The story mission this rule sets up; equal to its table key. */
  readonly storyId: StoryMissionId;
  /**
   * Adds the story's objectives, entities and schedules to a mission its
   * type has already set up, or refuses one it cannot set up.
   *
   * @param state - The mission after its type's setup rule.
   * @param map - The generated map.
   * @param mission - The overworld offer, with its `storyId`.
   * @param deps - Ids, the tunings, and the species a setup may place.
   */
  setup(
    state: TacticalState,
    map: TacticalMap,
    mission: Mission,
    deps: MissionSetupDeps,
  ): Result<TacticalState, TacticalError>;
}

/**
 * The story setups that are built, keyed by story mission. `Partial`,
 * because a story mission needs one only when its type's setup is not
 * the whole of it, and story missions land package by package.
 */
export type StorySetupRules = Readonly<
  Partial<Record<StoryMissionId, StorySetupRule>>
>;

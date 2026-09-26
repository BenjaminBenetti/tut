import { STORY_MISSION_IDS } from "../../../content/model/story-mission-id";
import type { Mission } from "../../model/mission";
import type {
  MissionPinContext,
  MissionPinTrigger,
} from "../../model/mission-pin-trigger";
import type { OverworldState } from "../../model/overworld-state";
import type { StoryMissionRules } from "../../model/story-mission-rule";
import { isStoryPinnable } from "../story-service";

// ===========================================
// Constants
// ===========================================

/** The story pin trigger's id; its RNG fork is `pin:story`. */
export const STORY_PIN_TRIGGER_ID = "story";

// ===========================================
// Trigger
// ===========================================

/**
 * The mission director's hook for the story spine (ADR 0013 §2.4,
 * §2.5): each day, pins every built story mission the spine says is due
 * (`isStoryPinnable`: its act, its `pinWhen` flags, not on the board,
 * not won, no delay pending) and whose rule finds a site today.
 *
 * ```
 *   for id in STORY_MISSION_IDS with a rule:
 *     isStoryPinnable(rule, state)? ──► rule.create(state, ctx on rng.fork(id))
 *                                        ──► undefined: no site today, ask tomorrow
 *                                        └─► pinned offer on a free city, or on
 *                                            one holding an ordinary offer, which
 *                                            the director withdraws (#1179)
 * ```
 *
 * Rules are visited in `STORY_MISSION_IDS` order, each on a fork of the
 * trigger's stream labelled with its id, so building one more story
 * mission never changes what another draws. Each rule sees the offers
 * pinned before it, and not the ordinary offers they displaced. An
 * offer that is not pinned, has the wrong story id, or lands on a city
 * whose offer `ctx.displaceable` refuses (a pinned or triggered one) is
 * a programmer error in the rule.
 *
 * @throws {RangeError} if a rule's offer breaks that contract.
 */
export function createStoryPinTrigger(
  rules: StoryMissionRules,
): MissionPinTrigger {
  return {
    id: STORY_PIN_TRIGGER_ID,
    pin: (state, ctx) => {
      let current = state;
      const pinned: Mission[] = [];
      for (const id of STORY_MISSION_IDS) {
        const rule = rules[id];
        if (rule === undefined || !isStoryPinnable(rule, current)) {
          continue;
        }
        const mission = rule.create(current, { ...ctx, rng: ctx.rng.fork(id) });
        if (mission === undefined) {
          continue;
        }
        assertStoryOffer(mission, id, current, ctx);
        pinned.push(mission);
        current = {
          ...current,
          missions: [
            ...current.missions.filter((m) => m.cityId !== mission.cityId),
            mission,
          ],
        };
      }
      return pinned;
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * Rejects an offer that is not a pinned `id` offer on a city that is
 * free or holds an offer `ctx.displaceable` allows.
 */
function assertStoryOffer(
  mission: Mission,
  id: string,
  state: OverworldState,
  ctx: MissionPinContext,
): void {
  if (mission.pinned !== true || mission.storyId !== id) {
    throw new RangeError(
      `Story rule "${id}" must offer a pinned mission with storyId "${id}"`,
    );
  }
  const held = state.missions.find((m) => m.cityId === mission.cityId);
  if (held !== undefined && !ctx.displaceable(held)) {
    throw new RangeError(
      `Story rule "${id}" offered city "${mission.cityId}", which holds offer "${held.id}" that cannot be withdrawn`,
    );
  }
}

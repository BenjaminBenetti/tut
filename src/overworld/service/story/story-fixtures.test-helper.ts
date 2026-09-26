import type { MissionTypeId } from "../../../content/model/mission-type-id";
import type { StoryMissionId } from "../../../content/model/story-mission-id";
import type { City } from "../../model/city";
import type { OverworldState } from "../../model/overworld-state";
import type {
  StoryMissionRule,
  StoryMissionRules,
} from "../../model/story-mission-rule";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { citiesWithOffers } from "../missions/mission-offer-builder";
import { buildStoryOffer } from "./story-offer-builder";

// ===========================================
// Constants
// ===========================================

/** The mission type a fixture story rule is built on. */
export const FIXTURE_STORY_TYPE: MissionTypeId = "infestation-clearance";

/** A fixture story rule's fixed difficulty. */
export const FIXTURE_STORY_DIFFICULTY = 2;

// ===========================================
// Rules
// ===========================================

/**
 * A story mission rule for tests, so the spine can be exercised before
 * the real story missions are built (they land package by package).
 * Later packages reuse it for the parts of their tests that are about
 * the spine rather than their mission.
 *
 * Defaults: Act I, pinned as soon as the campaign is in Act I (no
 * flags), a `FIXTURE_STORY_TYPE` offer at `FIXTURE_STORY_DIFFICULTY` on
 * the first infested city without an offer (none: no site today), no
 * effects on a win, and a retry after `STORY_RETRY_DAYS` on a loss.
 * `create` follows the stamped `act`, so overriding `act` alone is
 * enough.
 *
 * ```
 *   fixtureStoryRule("live-specimen", { onWon: [{ kind: "advance-act" }] })
 * ```
 */
export function fixtureStoryRule(
  id: StoryMissionId,
  overrides: Partial<Omit<StoryMissionRule, "id">> = {},
): StoryMissionRule {
  const act = overrides.act ?? "act-1";
  return {
    id,
    act,
    pinWhen: [],
    create: (state, ctx) => {
      const city = firstFreeInfestedCity(state);
      return city === undefined
        ? undefined
        : buildStoryOffer(
            state,
            city,
            {
              storyId: id,
              typeId: FIXTURE_STORY_TYPE,
              difficulty: FIXTURE_STORY_DIFFICULTY,
              act,
            },
            ctx,
          );
    },
    onWon: [],
    onLost: { kind: "retry", delayDays: STORY_RETRY_DAYS },
    ...overrides,
  };
}

/** A rules table holding `rules`, each under its own id. */
export function storyRulesOf(
  ...rules: readonly StoryMissionRule[]
): StoryMissionRules {
  return Object.fromEntries(rules.map((rule) => [rule.id, rule]));
}

// ===========================================
// Helpers
// ===========================================

/** The first city in map order that is infested and holds no offer. */
function firstFreeInfestedCity(state: OverworldState): City | undefined {
  const taken = citiesWithOffers(state);
  return state.map.cities.find(
    (city) => city.infestation > 0 && !taken.has(city.id),
  );
}

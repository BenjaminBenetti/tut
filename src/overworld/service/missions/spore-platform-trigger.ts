import type { Mission } from "../../model/mission";
import type { MissionTriggerRule } from "../../model/mission-offer-rule";

// ===========================================
// Spore Platform: offer
// ===========================================

/**
 * How the Spore Platform is offered (campaign arc §6.9, ADR 0013 §2.5):
 * never by the director. The story's pin trigger makes the one offer
 * when the finale begins (`STORY_MISSION_RULES["spore-platform"]`), so
 * this entry offers nothing and holds no weight in any act.
 *
 * A trigger rather than an offer rule on purpose: a trigger sits
 * outside the board cap, so the pinned finale is never counted against
 * it, and a trigger that offers nothing draws nothing (its stream is a
 * labelled fork of the day's), so the director's draws are the same as
 * before the type existed.
 *
 * ```
 *   any day ──► []   (the story pins it)
 * ```
 */
export const SPORE_PLATFORM_TRIGGER: MissionTriggerRule = {
  kind: "trigger",
  typeId: "spore-platform",

  /** Nothing: the story pins the finale, the director never offers it. */
  trigger(): readonly Mission[] {
    return [];
  },
};

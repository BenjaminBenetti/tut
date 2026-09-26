import type { ActId } from "../../../content/model/act-id";
import type { MissionTypeId } from "../../../content/model/mission-type-id";
import type { StoryMissionId } from "../../../content/model/story-mission-id";
import type { City } from "../../model/city";
import type { Mission } from "../../model/mission";
import type { MissionOfferContext } from "../../model/mission-offer-rule";
import type { OverworldState } from "../../model/overworld-state";
import { buildOfferAtDifficulty } from "../missions/mission-offer-builder";

// ===========================================
// Types
// ===========================================

/** What a story mission's offer is, beyond its city. */
export interface StoryOfferSpec {
  /** The story mission the offer is. */
  readonly storyId: StoryMissionId;
  /** The mission type it is built on: picks its map, setup, briefing and type consequences. */
  readonly typeId: MissionTypeId;
  /** Its fixed difficulty (arc §3: story missions use fixed difficulties). */
  readonly difficulty: number;
  /** The act it belongs to, stamped on the offer. */
  readonly act: ActId;
}

// ===========================================
// Builder
// ===========================================

/**
 * A story mission's pinned offer at `city` (ADR 0013 §2.2, §2.5): the
 * ordinary offer of `spec.typeId` at the fixed `spec.difficulty`, so
 * rewards, map size and carcass follow that difficulty and no act band
 * clamps it, marked `pinned` with its `storyId` and `act`. Pinned, it
 * never expires and sits outside the board cap. Draws what
 * `buildOfferAtDifficulty` draws: one id and one map seed from `ctx`.
 *
 * ```
 *   buildOfferAtDifficulty(city, typeId, difficulty) ──► { …offer, pinned: true, storyId, act }
 * ```
 */
export function buildStoryOffer(
  state: OverworldState,
  city: City,
  spec: StoryOfferSpec,
  ctx: MissionOfferContext,
): Mission {
  return {
    ...buildOfferAtDifficulty(state, city, spec.typeId, spec.difficulty, ctx),
    pinned: true,
    storyId: spec.storyId,
    act: spec.act,
  };
}

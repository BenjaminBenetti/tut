import type { Mission } from "./mission";
import type { MissionOfferContext } from "./mission-offer-rule";
import type { OverworldState } from "./overworld-state";

// ===========================================
// Pin trigger
// ===========================================

/**
 * A source of pinned offers that is not one mission type (ADR 0013
 * §2.4): the story spine pins story missions, each built on an existing
 * type. The mission director runs every pin trigger first, before the
 * type trigger rules and before it counts the board, so a pinned offer
 * claims its city first and never takes a place under the cap.
 *
 * ```
 *   director ──► pinTriggers[i].pin(state, rng.fork(`pin:${id}`)) ──► pinned offers
 *            ──► MISSION_OFFER_RULES triggers ──► board fill
 * ```
 */
export interface MissionPinTrigger {
  /** Unique among the director's pin triggers; labels its RNG fork. */
  readonly id: string;
  /**
   * The offers to pin today, possibly none. Each is `pinned`, sits on a
   * city without an offer in `state`, and no two share a city. Draws ids
   * from `ctx.ids` and anything random from `ctx.rng`.
   */
  pin(state: OverworldState, ctx: MissionOfferContext): readonly Mission[];
}

import type { Mission } from "./mission";
import type { MissionOfferContext } from "./mission-offer-rule";
import type { OverworldState } from "./overworld-state";

// ===========================================
// Pin context
// ===========================================

/**
 * What the mission director hands a pin trigger (ADR 0013 §2.4): the
 * offer context, plus which offers on the board a pinned offer may
 * take the city of. The director owns the answer, since only it knows
 * how each type is offered.
 */
export interface MissionPinContext extends MissionOfferContext {
  /**
   * Whether a pinned offer may take `mission`'s city, withdrawing it:
   * true only for an ordinary offer, one the board drew and did not
   * pin. Never for a pinned offer (another story mission, a hive) or a
   * triggered one (Defend Installation).
   */
  displaceable(mission: Mission): boolean;
}

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
 *            ──► an ordinary offer on a pinned offer's city ──► withdrawn
 *            ──► MISSION_OFFER_RULES triggers ──► board fill
 * ```
 */
export interface MissionPinTrigger {
  /** Unique among the director's pin triggers; labels its RNG fork. */
  readonly id: string;
  /**
   * The offers to pin today, possibly none. Each is `pinned`, and no two
   * share a city. Each sits on a city without an offer in `state`, or on
   * one whose offer `ctx.displaceable` allows, which the director then
   * withdraws (#1179). Draws ids from `ctx.ids` and anything random from
   * `ctx.rng`.
   */
  pin(state: OverworldState, ctx: MissionPinContext): readonly Mission[];
}

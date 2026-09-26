import type { Mission } from "./mission";
import type { MissionOfferContext } from "./mission-offer-rule";
import type { OverworldState } from "./overworld-state";

// ===========================================
// Offer decorator
// ===========================================

/**
 * Adds something to every new offer after its rule made it: the
 * species mix, sitreps (ADR 0013 §2.6, arc §11). The director applies
 * its decorators to each offer, triggered or drawn, in list order, so
 * a later package adds a decoration by adding a decorator, never by
 * editing the director or the rules.
 *
 * ```
 *   rule.create / rule.trigger ──► mission
 *     └─► decorators[0].decorate ──► decorators[1].decorate ──► … ──► offered
 * ```
 *
 * Each decorator draws from its own stream: `ctx.rng` is a fork
 * labelled with the decorator's `id` and the mission's id, so adding,
 * removing or reordering decorators never changes what the rules or
 * the other decorators draw.
 */
export interface MissionOfferDecorator {
  /** Unique among the director's decorators; labels its RNG fork. */
  readonly id: string;
  /**
   * The offer with this decorator's additions. Pure: returns a copy,
   * never mutates `mission`.
   *
   * @param mission - The offer so far, with every earlier decorator applied.
   * @param state - The overworld the offer is made on, without the offer.
   * @param ctx - The director's context, `rng` forked for this decorator and offer.
   */
  decorate(
    mission: Mission,
    state: OverworldState,
    ctx: MissionOfferContext,
  ): Mission;
}

import type { MissionOfferDecorator } from "../../model/mission-offer-decorator";
import type { SitrepCatalogue } from "../../model/sitrep-definition";
import { SITREPS } from "../../data/sitreps";
import { withBugMix } from "./bestiary-offer";
import { withSitreps } from "./sitrep-offer";

// ===========================================
// Decorators
// ===========================================

/**
 * The sitrep roll as an offer decorator (campaign arc §11): rolls the
 * act's slots on the decorator's own fork and freezes what it drew on
 * the offer. Built over a catalogue so tests can substitute one.
 *
 * @param catalogue - Every sitrep's debut, weight and side.
 * @returns The decorator, id `"sitreps"`.
 */
export function createSitrepDecorator(
  catalogue: SitrepCatalogue,
): MissionOfferDecorator {
  return {
    id: "sitreps",
    decorate: (mission, state, ctx) =>
      withSitreps(mission, state.progress, ctx.act, ctx.rng, catalogue),
  };
}

// ===========================================
// The list
// ===========================================

/**
 * What the director adds to every new offer after its rule made it, in
 * order (ADR 0013 §2.4). Each entry registers here, so none edits the
 * director. Append, never insert: each decorator draws from its own
 * labelled fork, but the order decides which sees the other's result.
 *
 * ```
 *   rule.create ──► bestiary (bugMix, §2.6) ──► sitreps (arc §11) ──► board
 * ```
 */
export const MISSION_OFFER_DECORATORS: readonly MissionOfferDecorator[] = [
  {
    id: "bestiary",
    decorate: (mission, state) => withBugMix(mission, state.progress),
  },
  createSitrepDecorator(SITREPS),
];

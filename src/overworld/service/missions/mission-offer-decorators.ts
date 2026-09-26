import type { MissionOfferDecorator } from "../../model/mission-offer-decorator";
import { withBugMix } from "./bestiary-offer";

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
 *   rule.create ──► bestiary (bugMix, §2.6) ──► … sitreps (arc §11) ──► board
 * ```
 */
export const MISSION_OFFER_DECORATORS: readonly MissionOfferDecorator[] = [
  {
    id: "bestiary",
    decorate: (mission, state) => withBugMix(mission, state.progress),
  },
];

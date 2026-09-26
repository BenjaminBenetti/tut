import type { MissionOfferDecorator } from "../../model/mission-offer-decorator";

// ===========================================
// The list
// ===========================================

/**
 * What the director adds to every new offer after its rule made it, in
 * order (ADR 0013 §2.4). Empty today; the species mix (§2.6) and sitreps
 * (arc §11) register here, so neither edits the director. Append, never
 * insert: each decorator draws from its own labelled fork, but the
 * order decides which sees the other's result.
 */
export const MISSION_OFFER_DECORATORS: readonly MissionOfferDecorator[] = [];

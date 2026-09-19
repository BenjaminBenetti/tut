import type { EconomyTuning } from "../model/economy-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * The default tuning bundle, for injection into economy services.
 *
 * The three values were also exported individually beside it until #141.
 * Nothing outside this file's own test read them — every consumer takes
 * the bundle — so they were six lines of duplication waiting to drift
 * from the object two lines below (ADR 0003 §2.5).
 */
export const ECONOMY_TUNING: EconomyTuning = {
  /**
   * Credits a new campaign begins with. Placeholder until item prices
   * land; chosen so the starting bankroll is roughly ten days of full
   * stipend.
   */
  startingCredits: 5000,
  /** Daily stipend at zero global infestation (GDD §5.5). Placeholder. */
  baseStipend: 500,
  /**
   * Daily stipend floor so an almost-overrun Earth still trickles
   * income. Placeholder at a tenth of `baseStipend`.
   */
  stipendFloor: 50,
  /**
   * A campaign opens with the tier 1 catalogue and nothing banked: the
   * first unlock is earned on the first mission (#1171).
   */
  startingTechPoints: 0,
};

import type { EconomyTuning } from "../model/economy-tuning";

// ===========================================
// Default values
// ===========================================

/**
 * Credits a new campaign begins with. Placeholder until item prices land;
 * chosen so the starting bankroll is roughly ten days of full stipend.
 */
export const startingCredits = 5000;

/** Daily stipend at zero global infestation (GDD §5.5). Placeholder. */
export const baseStipend = 500;

/**
 * Daily stipend floor so an almost-overrun Earth still trickles income.
 * Placeholder at a tenth of `baseStipend`.
 */
export const stipendFloor = 50;

// ===========================================
// Aggregate
// ===========================================

/**
 * The default tuning bundle, for injection into economy services.
 * `startingCredits`, `baseStipend` and `stipendFloor` are also exported
 * individually for callers that need a single value.
 */
export const ECONOMY_TUNING: EconomyTuning = {
  startingCredits,
  baseStipend,
  stipendFloor,
};

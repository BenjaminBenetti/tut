import type { EventTuning } from "../model/event-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default event tuning. Placeholders until the loop is tuned end to end:
 *
 * - `dailyEventChance` 0.15: an event roughly every week, so choices
 *   punctuate the campaign without crowding out missions.
 * - `expiryDays` 5: an unanswered event resolves itself in under a week.
 */
export const EVENT_TUNING: EventTuning = {
  dailyEventChance: 0.15,
  expiryDays: 5,
};

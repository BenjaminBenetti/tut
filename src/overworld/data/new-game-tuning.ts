import type { NewGameTuning } from "../model/new-game-tuning";

/**
 * How a campaign opens: two or three cities infested at 10–30 (#54).
 * Placeholder until the tick pipeline is playable end to end and the
 * opening can be balanced against the stipend and spread rates.
 */
export const NEW_GAME_TUNING: NewGameTuning = {
  infestedCities: { min: 2, max: 3 },
  initialInfestation: { min: 10, max: 30 },
};

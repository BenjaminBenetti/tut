import type { DomainEvent } from "../../core/model/domain-event";
import type { GameOutcome } from "./game-outcome";

// ===========================================
// Game ended
// ===========================================

/** Event type emitted once, when the campaign is won or lost. */
export const GAME_ENDED = "overworld:game-ended";

/** What presentation needs to show the end screen. */
export interface GameEndedPayload {
  readonly outcome: GameOutcome;
}

/** The campaign ended (GDD §5.3). Emitted at most once per campaign. */
export type GameEndedEvent = DomainEvent<typeof GAME_ENDED, GameEndedPayload>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [GAME_ENDED]: GameEndedEvent;
  }
}

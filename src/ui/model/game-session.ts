import type { GameState } from "../../save/model/game-state";

// ===========================================
// GameSession
// ===========================================

/**
 * Holds the live `GameState` between screens. Screens read it to render
 * and replace it after loading or applying commands; the app owns the
 * single instance and hands it to every screen through its constructor.
 *
 * Until the overworld command dispatcher lands, this is the only state
 * holder; once it does, the bootstrap will build a `GameStore` from the
 * session's state when a campaign starts.
 */
export interface GameSession {
  /** The current campaign state, or undefined when no campaign is active. */
  readonly state: GameState | undefined;

  /** Begins a session with the given state (new game or loaded save). */
  start(state: GameState): void;

  /** Replaces the state of the active session. Throws when no session is active. */
  replace(state: GameState): void;

  /** Ends the session; `state` becomes undefined. */
  clear(): void;
}

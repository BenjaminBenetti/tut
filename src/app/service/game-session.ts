import type { GameState } from "../../save/model/game-state";
import type { GameSession } from "../../ui/model/game-session";

// ===========================================
// InMemoryGameSession
// ===========================================

/**
 * The app's `GameSession`: a plain holder for the live state. It has no
 * DOM or storage dependencies, so it is unit-tested in Node and the
 * persistence of that state stays the main menu's business.
 */
export class InMemoryGameSession implements GameSession {
  // ===========================================
  // Fields
  // ===========================================

  private current: GameState | undefined;

  // ===========================================
  // GameSession
  // ===========================================

  /** The current campaign state, or undefined when no campaign is active. */
  get state(): GameState | undefined {
    return this.current;
  }

  /** Begins a session, replacing any campaign that was already active. */
  start(state: GameState): void {
    this.current = state;
  }

  /** Replaces the active session's state; throws if there is none, since that is a caller bug. */
  replace(state: GameState): void {
    if (this.current === undefined) {
      throw new Error("Cannot replace state: no game session is active");
    }
    this.current = state;
  }

  /** Ends the session. */
  clear(): void {
    this.current = undefined;
  }
}

import type { OverworldCommand } from "../../overworld/model/overworld-command";
import type { CampaignEvent } from "../../overworld/model/campaign-event";
import type { GameState } from "../../save/model/game-state";
import type { CommandSink, StateSource } from "./state-store";

// ===========================================
// Campaign store
// ===========================================

/**
 * The store a running campaign lives in, as screens see it: the read
 * side to render from and the command side to act through. The app's
 * `GameStore` satisfies both.
 */
export type CampaignStore = StateSource<
  GameState,
  OverworldCommand,
  CampaignEvent
> &
  CommandSink<GameState, OverworldCommand, CampaignEvent>;

// ===========================================
// GameSession
// ===========================================

/**
 * Holds the live campaign between screens. Starting a session builds a
 * fresh store around the state (new game, Continue, Import); screens
 * dispatch commands and subscribe through `store`, and the app's
 * composition root observes each new store to autosave it.
 *
 * ```
 *   start(state) ──► store = createStore(state) ──► observers(store)
 *   store         ◄── screens render / dispatch
 *   clear()       ──► store = undefined, observers detached
 * ```
 */
export interface GameSession {
  /** The active campaign's store, or undefined when no campaign is running. */
  readonly store: CampaignStore | undefined;

  /** The active campaign's current state; shorthand for `store?.getState()`. */
  readonly state: GameState | undefined;

  /** Begins a session around `state`, replacing any campaign already running. */
  start(state: GameState): void;

  /** Swaps the active session's state without a command (load). Throws when no session is active. */
  replace(state: GameState): void;

  /** Ends the session; `store` and `state` become undefined. */
  clear(): void;
}

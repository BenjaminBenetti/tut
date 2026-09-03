import type { Unsubscribe } from "../../core/model/event-bus";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import type { OverworldDomainEvent } from "../../overworld/model/overworld-domain-event";
import type { GameState } from "../../save/model/game-state";
import type { GameSession } from "../../ui/model/game-session";
import type { GameStore } from "./game-store";

// ===========================================
// Types
// ===========================================

/** The concrete store a campaign runs in. */
export type CampaignGameStore = GameStore<
  GameState,
  OverworldCommand,
  OverworldDomainEvent
>;

/** Builds the store for a campaign; the composition root binds the dispatcher. */
export type CampaignStoreFactory = (state: GameState) => CampaignGameStore;

/**
 * Called with every store the session creates; returns how to detach
 * when the session ends or restarts. Autosave is one such observer.
 */
export type StoreObserver = (store: CampaignGameStore) => Unsubscribe;

// ===========================================
// StoreGameSession
// ===========================================

/**
 * `GameSession` that owns one `GameStore` per campaign. It knows how to
 * build a store and whom to tell about it, and nothing about what the
 * state means.
 */
export class StoreGameSession implements GameSession {
  // ===========================================
  // Fields
  // ===========================================

  private readonly createStore: CampaignStoreFactory;
  private readonly observe: StoreObserver;
  private current:
    { store: CampaignGameStore; detach: Unsubscribe } | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param createStore - Builds the store for a new campaign.
   * @param observe - Attached to every store the session creates; no-op by default.
   */
  constructor(
    createStore: CampaignStoreFactory,
    observe: StoreObserver = () => () => undefined,
  ) {
    this.createStore = createStore;
    this.observe = observe;
  }

  // ===========================================
  // GameSession
  // ===========================================

  /** The active campaign's store, or undefined when none is running. */
  get store(): CampaignGameStore | undefined {
    return this.current?.store;
  }

  /** The active campaign's current state, or undefined when none is running. */
  get state(): GameState | undefined {
    return this.current?.store.getState();
  }

  /** Detaches any running campaign, builds a store for `state` and attaches the observer. */
  start(state: GameState): void {
    this.current?.detach();
    const store = this.createStore(state);
    this.current = { store, detach: this.observe(store) };
  }

  /** Replaces the active store's state; throws if there is none, since that is a caller bug. */
  replace(state: GameState): void {
    if (this.current === undefined) {
      throw new Error("Cannot replace state: no game session is active");
    }
    this.current.store.replaceState(state);
  }

  /** Detaches the observer and drops the store. */
  clear(): void {
    this.current?.detach();
    this.current = undefined;
  }
}

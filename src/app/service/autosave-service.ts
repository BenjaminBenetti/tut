import type { Unsubscribe } from "../../core/model/event-bus";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import type { OverworldDomainEvent } from "../../overworld/model/overworld-domain-event";
import type { GameState } from "../../save/model/game-state";
import type { SaveError } from "../../save/model/save-error";
import type { SaveSlotId } from "../../save/model/save-slot";
import type { GameSaveService } from "../../save/service/game-save-service";
import type { StateSource } from "../../ui/model/state-store";

// ===========================================
// Types
// ===========================================

/** Receives every failed autosave; the app logs it, tests record it. */
export type AutosaveFailureListener = (error: SaveError) => void;

// ===========================================
// AutosaveService
// ===========================================

/**
 * Keeps one save slot equal to a store's latest state: it writes the
 * state once when attached and again after every store notification,
 * so a reload can always Continue from the last successful command.
 * Failures are reported, never thrown, and never block play.
 *
 * ```
 *   attach(store) ──► saveGame(slot, store.getState())
 *   store change  ──► saveGame(slot, change.state)
 *   err           ──► onFailure(error)
 * ```
 */
export class AutosaveService {
  // ===========================================
  // Fields
  // ===========================================

  private readonly saves: GameSaveService;
  private readonly slot: SaveSlotId;
  private readonly onFailure: AutosaveFailureListener;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param saves - Where states are written.
   * @param slot - The slot kept in sync, normally `AUTOSAVE_SLOT_ID`.
   * @param onFailure - Told about every failed write.
   */
  constructor(
    saves: GameSaveService,
    slot: SaveSlotId,
    onFailure: AutosaveFailureListener,
  ) {
    this.saves = saves;
    this.slot = slot;
    this.onFailure = onFailure;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Saves the store's current state now and after every change. Returns
   * the unsubscribe that stops following the store.
   */
  attach(
    store: StateSource<GameState, OverworldCommand, OverworldDomainEvent>,
  ): Unsubscribe {
    this.save(store.getState());
    return store.subscribe((change) => {
      this.save(change.state);
    });
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Writes one state, routing a failure to the listener. */
  private save(state: GameState): void {
    const result = this.saves.saveGame(this.slot, state);
    if (!result.ok) {
      this.onFailure(result.error);
    }
  }
}

import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { GAME_STATE_MIGRATIONS } from "../data/migrations";
import type { GameState } from "../model/game-state";
import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import type { KeyValueStore } from "../model/key-value-store";
import type { SaveClock } from "../model/save-clock";
import type { SaveError } from "../model/save-error";
import type { SaveRepository } from "../model/save-repository";
import type { SaveSlotId, SaveSlotSummary } from "../model/save-slot";
import { KeyValueSaveRepository } from "../repository/key-value-save-repository";
import { isGameStateShape } from "./game-state-guard";
import { MigrationRunner } from "./migration-runner";
import { SaveCodec } from "./save-codec";
import { SaveService } from "./save-service";

// ===========================================
// GameSaveService
// ===========================================

/**
 * Save, load, export and import for the campaign `GameState`. One codec
 * serves both the slot path and the file path, so an exported file is
 * byte-for-byte what a slot stores and either can be imported.
 *
 * ```
 *   saveGame(slot, state) ──► codec.encode ──► repository.write(slot)
 *   loadGame(slot)        ◄── shape guard ◄── codec.decode ◄── repository.read(slot)
 *   exportGame(state)     ──► codec.encode ──► text for the player to keep
 *   importGame(text)      ◄── shape guard ◄── codec.decode ◄── pasted text
 * ```
 *
 * Decoding already validates the envelope and runs migrations; the shape
 * guard on top rejects an envelope of some other state so a wrong file
 * fails here with a `malformed` error rather than deep inside a screen.
 */
export class GameSaveService {
  // ===========================================
  // Fields
  // ===========================================

  private readonly saves: SaveService<GameState>;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Builds the slot service from the codec and repository so the file
   * path and the slot path cannot drift apart. Use
   * `createGameSaveService` unless a test needs to inject pieces.
   */
  constructor(
    private readonly codec: SaveCodec<GameState>,
    repository: SaveRepository,
    private readonly clock: SaveClock,
  ) {
    this.saves = new SaveService(codec, repository);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Stores the state in a slot, stamped with the clock. Storage failures are reported, not thrown. */
  saveGame(slot: SaveSlotId, state: GameState): Result<void, SaveError> {
    return this.saves.save(slot, state, this.clock.now());
  }

  /** Loads, migrates and shape-checks the state in a slot. */
  loadGame(slot: SaveSlotId): Result<GameState, SaveError> {
    const loaded = this.saves.load(slot);
    return loaded.ok ? checkShape(loaded.value) : loaded;
  }

  /** Every readable slot with its timestamp and schema version. */
  listSlots(): readonly SaveSlotSummary[] {
    return this.saves.listSlots();
  }

  /** Serializes the state as a self-describing JSON document for the player to keep. */
  exportGame(state: GameState): string {
    return this.codec.encode(state, this.clock.now());
  }

  /** Parses, migrates and shape-checks a document produced by `exportGame` or copied from a slot. */
  importGame(json: string): Result<GameState, SaveError> {
    const decoded = this.codec.decode(json);
    return decoded.ok ? checkShape(decoded.value.state) : decoded;
  }
}

// ===========================================
// Factory
// ===========================================

/**
 * The one wiring of the persistence path: current schema version, the
 * registered migrations and a namespaced repository over the given
 * store. The app passes a `WebStorageKeyValueStore`; tests pass a
 * `MemoryKeyValueStore`.
 */
export function createGameSaveService(
  store: KeyValueStore,
  clock: SaveClock,
): GameSaveService {
  const codec = new SaveCodec<GameState>(
    GAME_STATE_SCHEMA_VERSION,
    new MigrationRunner(GAME_STATE_MIGRATIONS, GAME_STATE_SCHEMA_VERSION),
  );
  return new GameSaveService(codec, new KeyValueSaveRepository(store), clock);
}

// ===========================================
// Helpers
// ===========================================

/** Turns a decoded state into a result, rejecting anything that is not a `GameState`. */
function checkShape(state: unknown): Result<GameState, SaveError> {
  return isGameStateShape(state)
    ? ok(state)
    : err({
        kind: "malformed",
        message:
          "Save state is not a campaign: expected meta, overworld, roster and economy",
      });
}

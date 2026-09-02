import type { KeyValueStore } from "../model/key-value-store";
import type { SaveRepository } from "../model/save-repository";
import type { SaveSlotId } from "../model/save-slot";

// ===========================================
// Constants
// ===========================================

const DEFAULT_PREFIX = "tut:save:";

// ===========================================
// KeyValueSaveRepository
// ===========================================

/**
 * Stores one save per key under a namespace prefix so saves can share
 * a `KeyValueStore` with other app data without colliding.
 */
export class KeyValueSaveRepository implements SaveRepository {
  // ===========================================
  // Construction
  // ===========================================

  /** Binds the repository to a store and an optional key prefix. */
  constructor(
    private readonly store: KeyValueStore,
    private readonly prefix: string = DEFAULT_PREFIX,
  ) {}

  // ===========================================
  // SaveRepository
  // ===========================================

  /** Lists slot ids by stripping the prefix from matching keys. */
  listIds(): readonly SaveSlotId[] {
    return this.store
      .keys()
      .filter((key) => key.startsWith(this.prefix))
      .map((key) => key.slice(this.prefix.length));
  }

  /** Reads the encoded text for a slot. */
  read(id: SaveSlotId): string | undefined {
    return this.store.get(this.keyFor(id));
  }

  /** Writes encoded text for a slot. */
  write(id: SaveSlotId, text: string): void {
    this.store.set(this.keyFor(id), text);
  }

  /** Removes a slot. */
  remove(id: SaveSlotId): void {
    this.store.remove(this.keyFor(id));
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Maps a slot id to its storage key. */
  private keyFor(id: SaveSlotId): string {
    if (id.length === 0) {
      throw new Error("Save slot id must not be empty");
    }
    return `${this.prefix}${id}`;
  }
}

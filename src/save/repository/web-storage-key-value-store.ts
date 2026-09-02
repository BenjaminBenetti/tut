import type { KeyValueStore } from "../model/key-value-store";

// ===========================================
// WebStorageKeyValueStore
// ===========================================

/**
 * Adapts a DOM `Storage` (localStorage or sessionStorage) to the
 * `KeyValueStore` contract. The app injects the concrete storage; this
 * module never reaches for a global, so the save layer stays testable.
 */
export class WebStorageKeyValueStore implements KeyValueStore {
  // ===========================================
  // Construction
  // ===========================================

  /** Wraps an existing `Storage` instance. */
  constructor(private readonly storage: Storage) {}

  // ===========================================
  // KeyValueStore
  // ===========================================

  /** Returns the value for the key, or undefined. */
  get(key: string): string | undefined {
    return this.storage.getItem(key) ?? undefined;
  }

  /** Stores the value; quota errors propagate to the caller. */
  set(key: string, value: string): void {
    this.storage.setItem(key, value);
  }

  /** Removes the key if present. */
  remove(key: string): void {
    this.storage.removeItem(key);
  }

  /** Lists every key in the storage. */
  keys(): readonly string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key !== null) {
        keys.push(key);
      }
    }
    return keys;
  }
}

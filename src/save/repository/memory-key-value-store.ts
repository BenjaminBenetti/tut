import type { KeyValueStore } from "../model/key-value-store";

// ===========================================
// MemoryKeyValueStore
// ===========================================

/** In-memory store for tests and for environments without persistence. */
export class MemoryKeyValueStore implements KeyValueStore {
  // ===========================================
  // Fields
  // ===========================================

  private readonly entries = new Map<string, string>();

  // ===========================================
  // KeyValueStore
  // ===========================================

  /** Returns the value for the key, or undefined. */
  get(key: string): string | undefined {
    return this.entries.get(key);
  }

  /** Stores the value under the key. */
  set(key: string, value: string): void {
    this.entries.set(key, value);
  }

  /** Removes the key if present. */
  remove(key: string): void {
    this.entries.delete(key);
  }

  /** Lists every key in insertion order. */
  keys(): readonly string[] {
    return [...this.entries.keys()];
  }
}

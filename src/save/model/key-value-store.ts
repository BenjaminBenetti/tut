/**
 * The narrowest storage contract the save layer needs. `localStorage`
 * satisfies it through an adapter; tests use an in-memory map.
 */
export interface KeyValueStore {
  /** Returns the stored text, or undefined when the key is absent. */
  get(key: string): string | undefined;

  /** Stores text under the key, replacing any previous value. */
  set(key: string, value: string): void;

  /** Removes the key; a no-op when absent. */
  remove(key: string): void;

  /** Lists every key currently stored. */
  keys(): readonly string[];
}

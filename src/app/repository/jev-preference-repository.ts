import type { KeyValueStore } from "../../save/model/key-value-store";
import type { JevPreference } from "../../ui/model/jev-preference";

// ===========================================
// Constants
// ===========================================

/**
 * Where the preference is kept. Outside the `tut:save:` namespace, so
 * the save repository never lists it as a slot and a new campaign or an
 * import never touches it.
 */
export const JEV_PREFERENCE_KEY = "tut:pref:smart-enemies";

/** The stored text for "off"; anything else, or nothing, reads as on. */
const OFF = "off";

/** The stored text for "on". */
const ON = "on";

// ===========================================
// KeyValueJevPreference
// ===========================================

/**
 * `JevPreference` over the app's `KeyValueStore` (`localStorage` in the
 * browser, a memory store in tests). Only an explicit `"off"` turns
 * smart enemies off, so a missing key, a cleared storage or a value a
 * later build wrote all leave the default, on (campaign arc §9).
 */
export class KeyValueJevPreference implements JevPreference {
  // ===========================================
  // Construction
  // ===========================================

  /**
   * @param store - The browser storage adapter the saves also use.
   * @param key - Where to keep the value; the shipped key unless a test says otherwise.
   */
  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string = JEV_PREFERENCE_KEY,
  ) {}

  // ===========================================
  // JevPreference
  // ===========================================

  /** On unless the player turned it off. */
  enabled(): boolean {
    return this.store.get(this.key) !== OFF;
  }

  /** Writes the choice; a storage failure (quota, private mode) propagates to the caller. */
  setEnabled(enabled: boolean): void {
    this.store.set(this.key, enabled ? ON : OFF);
  }
}

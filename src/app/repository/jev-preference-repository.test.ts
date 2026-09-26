import { describe, expect, it } from "vitest";

import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { KeyValueSaveRepository } from "../../save/repository/key-value-save-repository";
import {
  JEV_PREFERENCE_KEY,
  KeyValueJevPreference,
} from "./jev-preference-repository";

describe("KeyValueJevPreference", () => {
  it("is on by default, with nothing stored", () => {
    expect(new KeyValueJevPreference(new MemoryKeyValueStore()).enabled()).toBe(
      true,
    );
  });

  it("round-trips off and back on through storage, across instances", () => {
    const store = new MemoryKeyValueStore();
    new KeyValueJevPreference(store).setEnabled(false);
    expect(store.get(JEV_PREFERENCE_KEY)).toBe("off");
    // A fresh instance over the same storage is a new session.
    expect(new KeyValueJevPreference(store).enabled()).toBe(false);
    new KeyValueJevPreference(store).setEnabled(true);
    expect(new KeyValueJevPreference(store).enabled()).toBe(true);
  });

  it("reads anything but an explicit off as on", () => {
    const store = new MemoryKeyValueStore();
    store.set(JEV_PREFERENCE_KEY, "maybe");
    expect(new KeyValueJevPreference(store).enabled()).toBe(true);
  });

  it("is never mistaken for a save slot", () => {
    const store = new MemoryKeyValueStore();
    new KeyValueJevPreference(store).setEnabled(false);
    expect(new KeyValueSaveRepository(store).listIds()).toEqual([]);
  });
});

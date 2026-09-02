import { describe, expect, it } from "vitest";

import { WebStorageKeyValueStore } from "./web-storage-key-value-store";

/** Minimal Storage double so the adapter is tested without a DOM. */
const fakeStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
};

describe("WebStorageKeyValueStore", () => {
  it("adapts get/set/remove/keys onto Storage", () => {
    const store = new WebStorageKeyValueStore(fakeStorage());
    expect(store.get("x")).toBeUndefined();
    store.set("x", "1");
    store.set("y", "2");
    expect(store.get("x")).toBe("1");
    expect(store.keys()).toEqual(["x", "y"]);
    store.remove("x");
    expect(store.keys()).toEqual(["y"]);
  });
});

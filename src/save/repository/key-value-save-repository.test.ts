import { describe, expect, it } from "vitest";

import { KeyValueSaveRepository } from "./key-value-save-repository";
import { MemoryKeyValueStore } from "./memory-key-value-store";

describe("KeyValueSaveRepository", () => {
  it("prefixes keys and strips them on list", () => {
    const store = new MemoryKeyValueStore();
    const repo = new KeyValueSaveRepository(store, "p:");
    repo.write("a", "1");
    expect(store.get("p:a")).toBe("1");
    expect(repo.listIds()).toEqual(["a"]);
    expect(repo.read("a")).toBe("1");
    repo.remove("a");
    expect(repo.read("a")).toBeUndefined();
    expect(repo.listIds()).toEqual([]);
  });

  it("rejects empty slot ids", () => {
    const repo = new KeyValueSaveRepository(new MemoryKeyValueStore());
    expect(() => repo.write("", "x")).toThrow();
  });
});

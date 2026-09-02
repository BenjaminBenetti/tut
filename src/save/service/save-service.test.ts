import { describe, expect, it } from "vitest";

import { KeyValueSaveRepository } from "../repository/key-value-save-repository";
import { MemoryKeyValueStore } from "../repository/memory-key-value-store";
import { MigrationRunner } from "./migration-runner";
import { SaveCodec } from "./save-codec";
import { SaveService } from "./save-service";

interface Shape {
  readonly day: number;
}

const build = (): {
  service: SaveService<Shape>;
  store: MemoryKeyValueStore;
} => {
  const store = new MemoryKeyValueStore();
  const service = new SaveService<Shape>(
    new SaveCodec(1, new MigrationRunner([], 1)),
    new KeyValueSaveRepository(store),
  );
  return { service, store };
};

describe("SaveService", () => {
  it("saves, lists, loads, and deletes slots", () => {
    const { service } = build();
    expect(service.save("slot-1", { day: 4 }, "t1")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(service.save("autosave", { day: 5 }, "t2").ok).toBe(true);

    expect(service.listSlots()).toEqual([
      { id: "slot-1", savedAt: "t1", schemaVersion: 1 },
      { id: "autosave", savedAt: "t2", schemaVersion: 1 },
    ]);
    expect(service.load("slot-1")).toEqual({ ok: true, value: { day: 4 } });

    service.deleteSlot("slot-1");
    expect(service.load("slot-1")).toEqual({
      ok: false,
      error: { kind: "missing", message: 'No save in slot "slot-1"' },
    });
  });

  it("namespaces keys so unrelated entries are ignored", () => {
    const { service, store } = build();
    store.set("unrelated", "x");
    store.set("tut:save:broken", "{not json");
    service.save("good", { day: 1 }, "t");
    expect(service.listSlots().map((s) => s.id)).toEqual(["good"]);
  });

  it("reports storage failures instead of throwing", () => {
    const store = new MemoryKeyValueStore();
    store.set = () => {
      throw new Error("QuotaExceededError");
    };
    const service = new SaveService<Shape>(
      new SaveCodec(1, new MigrationRunner([], 1)),
      new KeyValueSaveRepository(store),
    );
    const result = service.save("slot-1", { day: 1 }, "t");
    expect(result).toEqual({
      ok: false,
      error: { kind: "storage", message: "QuotaExceededError" },
    });
  });
});

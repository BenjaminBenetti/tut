import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "./sequential-id-generator";

describe("SequentialIdGenerator", () => {
  it("counts per prefix starting at 1", () => {
    const ids = new SequentialIdGenerator();
    expect(ids.nextId("city")).toBe("city-1");
    expect(ids.nextId("city")).toBe("city-2");
    expect(ids.nextId("mech")).toBe("mech-1");
  });

  it("round-trips through getState", () => {
    const ids = new SequentialIdGenerator();
    ids.nextId("squad");
    ids.nextId("squad");
    const restored = new SequentialIdGenerator(
      JSON.parse(JSON.stringify(ids.getState())) as ReturnType<
        typeof ids.getState
      >,
    );
    expect(restored.nextId("squad")).toBe("squad-3");
    expect(restored.nextId("mech")).toBe("mech-1");
  });

  it("rejects prefixes that would make ids ambiguous", () => {
    const ids = new SequentialIdGenerator();
    expect(() => ids.nextId("")).toThrow();
    expect(() => ids.nextId("a-b")).toThrow();
  });
});

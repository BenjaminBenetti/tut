import { describe, expect, it } from "vitest";

import { createRegistry, DefinitionRegistry } from "./definition-registry";

interface Thing {
  readonly id: string;
  readonly weight: number;
}

const THINGS: readonly Thing[] = [
  { id: "a", weight: 1 },
  { id: "b", weight: 2 },
];

describe("DefinitionRegistry", () => {
  it("looks definitions up by id", () => {
    const registry = new DefinitionRegistry("thing", THINGS);
    expect(registry.get("a")).toBe(THINGS[0]);
    expect(registry.find("b")?.weight).toBe(2);
    expect(registry.find("c")).toBeUndefined();
    expect(registry.has("a")).toBe(true);
    expect(registry.has("c")).toBe(false);
  });

  it("preserves registration order", () => {
    const registry = new DefinitionRegistry("thing", THINGS);
    expect(registry.ids).toEqual(["a", "b"]);
    expect(registry.values).toEqual(THINGS);
  });

  it("throws with the registry label on an unknown id", () => {
    const registry = new DefinitionRegistry("thing", THINGS);
    expect(() => registry.get("zzz")).toThrow('Unknown thing id "zzz"');
  });

  it("rejects duplicate ids at construction", () => {
    expect(
      () =>
        new DefinitionRegistry("thing", [...THINGS, { id: "a", weight: 9 }]),
    ).toThrow('Duplicate thing id "a"');
  });

  it("is exposed through the createRegistry factory", () => {
    const registry = createRegistry("thing", THINGS);
    expect(registry.get("b").weight).toBe(2);
  });
});

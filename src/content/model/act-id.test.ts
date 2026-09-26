import { describe, expect, it } from "vitest";

import { ACT_IDS } from "./act-id";

describe("ACT_IDS", () => {
  it("lists each id once", () => {
    expect(new Set(ACT_IDS).size).toBe(ACT_IDS.length);
  });

  it("lists the acts in the order they are played", () => {
    expect(ACT_IDS).toEqual(["act-1", "act-2", "act-3", "finale"]);
  });
});

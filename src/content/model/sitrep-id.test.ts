import { describe, expect, it } from "vitest";

import { SITREP_IDS } from "./sitrep-id";

describe("SITREP_IDS", () => {
  it("lists each id once", () => {
    expect(new Set(SITREP_IDS).size).toBe(SITREP_IDS.length);
  });

  it("keeps the order the offer roll and the tactical rules depend on", () => {
    expect(SITREP_IDS).toEqual([
      "nightfall",
      "spore-fog",
      "city-ablaze",
      "salvage-rich",
      "local-guides",
    ]);
  });
});

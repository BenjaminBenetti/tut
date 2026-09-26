import { describe, expect, it } from "vitest";

import { NEMESIS_WOUNDS } from "../model/nemesis";
import { NEMESIS_LORE } from "./nemesis-lore";

describe("NEMESIS_LORE", () => {
  it("names at least 16 Broodmothers and 16 alphas, each name once (arc §6.8)", () => {
    for (const names of [
      NEMESIS_LORE.broodmotherNames,
      NEMESIS_LORE.alphaNames,
    ]) {
      expect(names.length).toBeGreaterThanOrEqual(16);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name.trim()).toBe(name);
        expect(name.length).toBeGreaterThan(0);
      }
    }
    expect(NEMESIS_LORE.broodmotherNames).toContain("Old Scald");
  });

  it("has scar lines for every wound and for an escape without one", () => {
    for (const mark of [...NEMESIS_WOUNDS, "unmarked" as const]) {
      const lines = NEMESIS_LORE.scars[mark];
      expect(lines.length, mark).toBeGreaterThan(0);
      for (const line of lines) {
        // Pronoun-free, so one line reads for a Broodmother and an alpha.
        expect(line, line).not.toMatch(/\b(she|her|he|his)\b/i);
      }
    }
  });
});

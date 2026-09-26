import { describe, expect, it } from "vitest";

import { SITREP_IDS } from "../../content/model/sitrep-id";
import { SITREPS } from "../../overworld/data/sitreps";
import { SITREP_PRESENTATION } from "./sitrep-presentation";

describe("SITREP_PRESENTATION", () => {
  it("presents every sitrep, with a name and a one-line effect", () => {
    expect(Object.keys(SITREP_PRESENTATION).sort()).toEqual(
      [...SITREP_IDS].sort(),
    );
    for (const id of SITREP_IDS) {
      const { name, effect } = SITREP_PRESENTATION[id];
      expect(name.length).toBeGreaterThan(0);
      expect(effect).not.toContain("\n");
      expect(effect.length).toBeLessThanOrEqual(64);
      expect(effect.endsWith(".")).toBe(true);
    }
  });

  it("agrees with the overworld about which sitreps help the player", () => {
    for (const id of SITREP_IDS) {
      expect(SITREP_PRESENTATION[id].helpsPlayer).toBe(SITREPS[id].helpsPlayer);
    }
  });
});

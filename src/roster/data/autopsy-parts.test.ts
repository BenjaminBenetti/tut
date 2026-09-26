import { describe, expect, it } from "vitest";

import { DAMAGE_TAGS } from "../../content/model/damage-tag";
import { AUTOPSY_PARTS } from "./autopsy-parts";
import { STARTER_PARTS } from "./parts";

describe("AUTOPSY_PARTS (campaign arc §10.2)", () => {
  it("sells every counter in the part catalogue, above tier 1 so research gates it", () => {
    for (const part of AUTOPSY_PARTS) {
      expect(STARTER_PARTS, part.id).toContain(part);
      expect(part.tier, part.id).toBeGreaterThan(1);
    }
  });

  it("resists a real damage tag with each, by whole positive points", () => {
    for (const part of AUTOPSY_PARTS) {
      const resist = Object.entries(part.traits?.resist ?? {});
      expect(resist.length, part.id).toBeGreaterThan(0);
      for (const [tag, points] of resist) {
        expect(DAMAGE_TAGS, part.id).toContain(tag);
        expect(Number.isInteger(points) && points > 0, part.id).toBe(true);
      }
    }
  });
});

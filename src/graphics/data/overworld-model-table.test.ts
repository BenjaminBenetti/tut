import { describe, expect, it } from "vitest";

import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import { MODEL_MANIFEST } from "./model-manifest";
import {
  DEPLOYABLE_MODEL_IDS,
  OVERWORLD_MODEL_IDS,
  SETTLEMENT_EGGS_MODEL_IDS,
  SETTLEMENT_MODEL_IDS,
} from "./overworld-model-table";

describe("overworld model table (#1155)", () => {
  it("maps every settlement scale to a registered model and a matching egg overlay", () => {
    for (const scale of SETTLEMENT_SCALES) {
      const base = MODEL_MANIFEST[SETTLEMENT_MODEL_IDS[scale]];
      const eggs = MODEL_MANIFEST[SETTLEMENT_EGGS_MODEL_IDS[scale]];
      expect(base.category).toBe("props");
      // The overlay stacks on the base at the same origin, so both share a footprint.
      expect(eggs.footprint).toEqual(base.footprint);
    }
  });

  it("maps every deployable type to a registered model on the deployable footprint", () => {
    for (const id of DEPLOYABLE_TYPE_IDS) {
      const entry = MODEL_MANIFEST[DEPLOYABLE_MODEL_IDS[id]];
      expect(entry.footprint).toEqual({ w: 0.45, d: 0.45 });
    }
  });

  it("preloads each model exactly once", () => {
    expect(new Set(OVERWORLD_MODEL_IDS).size).toBe(OVERWORLD_MODEL_IDS.length);
    expect(OVERWORLD_MODEL_IDS).toHaveLength(
      SETTLEMENT_SCALES.length * 2 + DEPLOYABLE_TYPE_IDS.length,
    );
  });
});

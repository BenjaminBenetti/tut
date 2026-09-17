import { describe, expect, it } from "vitest";

import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import { SETTLEMENT_STYLE_IDS } from "../model/settlement-style";
import { MODEL_MANIFEST } from "./model-manifest";
import {
  DEPLOYABLE_MODEL_IDS,
  OVERWORLD_MODEL_IDS,
  settlementEggsModelId,
  settlementModelId,
} from "./overworld-model-table";

describe("overworld model table (#1155)", () => {
  it("maps every style × scale to a registered model and a matching egg overlay", () => {
    for (const style of SETTLEMENT_STYLE_IDS) {
      for (const scale of SETTLEMENT_SCALES) {
        const base = MODEL_MANIFEST[settlementModelId(style, scale)];
        const eggs = MODEL_MANIFEST[settlementEggsModelId(style, scale)];
        expect(base.category).toBe("props");
        expect(base.footprint).toEqual({ w: 0.6, d: 0.6 });
        // The overlay stacks on the base at the same origin, so both share a footprint.
        expect(eggs.footprint).toEqual(base.footprint);
      }
    }
  });

  it("gives each style a different model at each scale", () => {
    for (const scale of SETTLEMENT_SCALES) {
      const ids = new Set(
        SETTLEMENT_STYLE_IDS.map((s) => settlementModelId(s, scale)),
      );
      expect(ids.size).toBe(SETTLEMENT_STYLE_IDS.length);
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
      SETTLEMENT_STYLE_IDS.length * SETTLEMENT_SCALES.length * 2 +
        DEPLOYABLE_TYPE_IDS.length,
    );
  });
});

import { describe, expect, it } from "vitest";

import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { createRegistry } from "../service/definition-registry";
import { BIOME_DEFINITIONS } from "./biomes";
import { KNOWN_BUILDING_KIND_IDS } from "./building-kind-ids";
import { BUILDING_TEMPLATES } from "./building-templates";
import { SETTLEMENT_DEFINITIONS } from "./settlements";

describe("building templates", () => {
  const templates = createRegistry(
    "building template",
    Object.values(BUILDING_TEMPLATES),
  );

  it("define every shipped kind exactly once", () => {
    for (const id of KNOWN_BUILDING_KIND_IDS) {
      expect(templates.has(id), id).toBe(true);
    }
    expect(templates.ids.length).toBe(KNOWN_BUILDING_KIND_IDS.length);
  });

  it("keep ranges ordered, densities in [0, 1] and scales non-empty", () => {
    for (const template of templates.values) {
      for (const range of [
        template.footprintWidth,
        template.footprintDepth,
        template.floors,
      ]) {
        expect(range.min, template.id).toBeGreaterThanOrEqual(1);
        expect(range.max, template.id).toBeGreaterThanOrEqual(range.min);
      }
      expect(template.windowDensity).toBeGreaterThanOrEqual(0);
      expect(template.windowDensity).toBeLessThanOrEqual(1);
      expect(template.scales.length, template.id).toBeGreaterThan(0);
      expect(template.minRoomSize).toBeGreaterThanOrEqual(2);
      if (template.roofWalkable) {
        expect(template.roof, template.id).toBe("flat");
      }
    }
  });

  it("fit the smallest lot of every scale they appear in", () => {
    for (const template of templates.values) {
      for (const scale of template.scales) {
        const settlement = SETTLEMENT_DEFINITIONS[scale];
        expect(
          template.footprintWidth.min,
          `${template.id}/${scale}`,
        ).toBeLessThanOrEqual(settlement.lotWidth.max);
        expect(
          template.footprintDepth.min,
          `${template.id}/${scale}`,
        ).toBeLessThanOrEqual(settlement.lotDepth.max);
      }
    }
  });

  it("give every scale of every biome at least one usable kind", () => {
    for (const biome of Object.values(BIOME_DEFINITIONS)) {
      for (const scale of SETTLEMENT_SCALES) {
        const usable = biome.buildingKinds.filter((entry) =>
          templates.get(entry.template).scales.includes(scale),
        );
        expect(usable.length, `${biome.id}/${scale}`).toBeGreaterThan(0);
      }
    }
  });
});

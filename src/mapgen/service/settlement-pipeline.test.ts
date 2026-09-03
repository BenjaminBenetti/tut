import { describe, expect, it } from "vitest";

import { createDefaultRegistries } from "./default-registries";
import { validatePipeline } from "./pipeline-map-generator";
import { createPipeline, createSettlementPasses } from "./settlement-pipeline";

describe("settlement pipeline", () => {
  it("lists the ADR 0004 passes in order with satisfied requirements", () => {
    const passes = createSettlementPasses();
    expect(passes.map((p) => p.id)).toEqual([
      "terrain",
      "water",
      "roads",
      "lots",
      "buildings",
      "interiors",
      "props",
      "ramps",
      "hooks",
      "connectivity",
    ]);
    expect(() => {
      validatePipeline(passes);
    }).not.toThrow();
    expect(passes[passes.length - 1]?.provides).toEqual(["connected"]);
  });

  it("builds a fresh pipeline per call", () => {
    const registries = createDefaultRegistries();
    const a = createPipeline("settlement", registries);
    const b = createPipeline("settlement", registries);
    expect(a).not.toBe(b);
    expect(a.passIds).toEqual(b.passIds);
  });
});

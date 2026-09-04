// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { computeMapMetrics } from "../../mapgen/service/map-metrics";
import { assessMap } from "../../tactical/service/map-assessment-service";
import type { PreviewResult } from "./mapgen-preview-screen";
import { MapgenPreviewScreen } from "./mapgen-preview-screen";

function result(props: number): PreviewResult {
  const builder = new FixtureMapBuilder(8, 8, 1)
    .fillGround()
    .deploy([{ x: 0, y: 0, z: 0 }]);
  for (let i = 0; i < props; i++) {
    builder.prop(PropKindIds.BOULDER, { x: 2 + i, y: 0, z: 4 });
  }
  const map = builder.build();
  return {
    map,
    diagnostics: { notes: [], timings: [] },
    metrics: computeMapMetrics(map),
    assessment: assessMap(map),
    ascii: "",
    elapsedMs: 1,
  };
}

describe("MapgenPreviewScreen", () => {
  it("steps the seed with the Next button and generates", () => {
    const onGenerate = vi.fn();
    const root = document.createElement("div");
    const screen = new MapgenPreviewScreen(
      root,
      {
        seed: "terra-01",
        biome: "temperate",
        settlement: "town",
        size: "medium",
        archetype: "settlement",
      },
      { onGenerate, onLevelChange: vi.fn() },
    );
    root.querySelector<HTMLButtonElement>("#next-seed")?.click();
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ seed: "terra-02" }),
    );
    screen.advanceSeed();
    expect(screen.getState().seed).toBe("terra-03");
  });

  it("shows metric deltas from the second map on", () => {
    const root = document.createElement("div");
    const screen = new MapgenPreviewScreen(
      root,
      {
        seed: "s",
        biome: "temperate",
        settlement: "town",
        size: "medium",
        archetype: "settlement",
      },
      { onGenerate: vi.fn(), onLevelChange: vi.fn() },
    );
    const stats = (): string => root.querySelector("#stats")?.textContent ?? "";
    screen.showResult(result(1));
    expect(stats()).toMatch(/Beside cover[\d.]+ %Beside a wall/);
    expect(stats()).toMatch(/Approach.*steps to the nearest objective/);
    expect(stats()).toMatch(/Firing positions[\d.]+ per objective/);
    expect(stats()).toMatch(/Bug walk-in.*steps from the nearest edge spawn/);
    expect(stats()).toMatch(/Visible in range.*from a standing unit/);
    expect(stats()).toMatch(/Cover that holds[\d.]+ % one side, [\d.]+ % two/);
    expect(stats()).toMatch(/Covered sides[\d.]+ per open tile/);
    expect(stats()).toMatch(
      /Closed to melee[\d.]+ % one side, [\d.]+ % two, [\d.]+ per open tile/,
    );
    screen.showResult(result(3));
    expect(stats()).toMatch(/Beside cover.*\(\+/);
    screen.showResult(result(3));
    expect(stats()).toMatch(/Beside cover.*\(±/);
  });
});

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
  it("exposes whole infestation bands and their overworld equivalent", () => {
    const root = document.createElement("div");
    const onGenerate = vi.fn();
    const screen = new MapgenPreviewScreen(
      root,
      {
        seed: "infestation",
        biome: "temperate",
        settlement: "town",
        size: "small",
        archetype: "settlement",
        slopeShare: 1,
        infestation: 4,
      },
      { onGenerate, onLevelChange: vi.fn() },
    );
    const input = root.querySelector<HTMLInputElement>("#infestation")!;
    expect(input.value).toBe("4");
    expect(input.closest("label")?.textContent).toContain("40 overworld");
    input.value = "10";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("change"));
    expect(screen.getState().infestation).toBe(10);
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ infestation: 10 }),
    );
  });
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
        slopeShare: 1,
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

  it("offers only the authored installation compounds, never a story facility that borrows one (#1179)", () => {
    const root = document.createElement("div");
    new MapgenPreviewScreen(
      root,
      {
        seed: "s",
        biome: "temperate",
        settlement: "town",
        size: "small",
        archetype: "settlement",
        slopeShare: 1,
      },
      { onGenerate: vi.fn(), onLevelChange: vi.fn() },
    );
    const control = root.querySelector<HTMLSelectElement>("#site")!;
    expect([...control.options].map((o) => o.value)).toEqual([
      "",
      "sensor-array",
      "repellent-dispersal",
      "defensive-battery",
      "bank",
    ]);
  });

  it("offers every archetype and generates the one picked (#1179)", () => {
    const onGenerate = vi.fn();
    const root = document.createElement("div");
    const screen = new MapgenPreviewScreen(
      root,
      {
        seed: "s",
        biome: "temperate",
        settlement: "rural",
        size: "small",
        archetype: "settlement",
        slopeShare: 1,
      },
      { onGenerate, onLevelChange: vi.fn() },
    );
    const control = root.querySelector<HTMLSelectElement>("#archetype")!;
    expect([...control.options].map((o) => o.value)).toEqual([
      "settlement",
      "crash-site",
      "hive-cavern",
      "spore-platform-hull",
      "spore-platform-core",
      "great-hive-cavern",
    ]);
    expect(control.value).toBe("settlement");
    expect(control.closest("label")?.textContent).toContain("Crash site");
    control.value = "crash-site";
    root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(screen.getState().archetype).toBe("crash-site");
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ archetype: "crash-site" }),
    );
  });

  it("opens on the archetype the URL asked for", () => {
    const root = document.createElement("div");
    const screen = new MapgenPreviewScreen(
      root,
      {
        seed: "s",
        biome: "temperate",
        settlement: "rural",
        size: "small",
        archetype: "crash-site",
        slopeShare: 1,
      },
      { onGenerate: vi.fn(), onLevelChange: vi.fn() },
    );
    expect(root.querySelector<HTMLSelectElement>("#archetype")?.value).toBe(
      "crash-site",
    );
    expect(screen.getState().archetype).toBe("crash-site");
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
        slopeShare: 1,
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

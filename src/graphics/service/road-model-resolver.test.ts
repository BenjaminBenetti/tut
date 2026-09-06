import { describe, expect, it } from "vitest";
import { TileIndex } from "../../mapgen/service/tile-index";
import { stepGridPos } from "../../core/service/grid-math";
import { carriagewayMap } from "../../../tools/art/preview/carriageways-fixture";
import { resolveRoadAppearances } from "./road-model-resolver";
import { resolveMapModels } from "./map-model-resolver";

describe("carriageway fitting (#840)", () => {
  for (const width of [2, 3, 4]) {
    it(`${width} lanes have one divider per arm, one crossing mark and no kerb across a mouth`, () => {
      const map = carriagewayMap({
        id: "cross",
        title: "cross",
        style: "grid",
        width,
        shape: "cross",
      });
      const index = new TileIndex(map);
      const appearances = resolveRoadAppearances(map, index);
      const roads = map.tiles.filter((tile) => tile.surface === "road");
      expect(appearances.size).toBe(roads.length);
      const horizontal = roads.filter((tile) => tile.x === 2);
      const vertical = roads.filter((tile) => tile.z === 2);
      for (const arm of [horizontal, vertical]) {
        const marked = arm.filter(
          (tile) => appearances.get(index.keyOf(tile))!.line,
        );
        expect(marked).toHaveLength(1);
        const tile = marked[0]!;
        const line = appearances.get(index.keyOf(tile))!.line!;
        const across = arm === horizontal ? tile.z : tile.x;
        expect(across + 0.5 + line.offset).toBe(
          Math.floor((18 - width) / 2) + width / 2,
        );
      }
      const crossings = [...appearances.values()].filter((a) => a.junction);
      expect(crossings).toHaveLength(1);
      expect(crossings[0]!.junction!.kind).toBe("cross");
      for (const tile of roads) {
        const appearance = appearances.get(index.keyOf(tile))!;
        for (const turn of appearance.kerbs) {
          const side = (["s", "w", "n", "e"] as const)[turn];
          expect(index.getAt(stepGridPos(tile, side))?.surface).not.toBe(
            "road",
          );
        }
      }
      const placed = resolveMapModels(map).tiles.filter((p) => p.road);
      expect(placed).toHaveLength(roads.length);
      expect(
        placed.filter((p) => p.modelId === "tile.city.road-cross"),
      ).toHaveLength(1);
    });
  }

  it("keeps the two-lane bend open and turns the outside kerb continuously", () => {
    const map = carriagewayMap({
      id: "bend",
      title: "bend",
      style: "streets",
      width: 2,
      shape: "corner",
    });
    const placements = resolveMapModels(map).tiles.filter((p) => p.road);
    expect(
      placements.some((p) => p.modelId === "tile.city.road-kerb-corner"),
    ).toBe(true);
    expect(placements.some((p) => p.road!.junction)).toBe(false);
  });

  it("uses one T at a three-lane mouth and leaves trails unpainted without concrete kerbs", () => {
    const make = (style: "streets" | "trail") =>
      carriagewayMap({ id: style, title: style, style, width: 3, shape: "t" });
    const street = resolveMapModels(make("streets")).tiles.filter(
      (p) => p.road,
    );
    expect(street.filter((p) => p.road!.junction?.kind === "t")).toHaveLength(
      1,
    );
    const trail = resolveMapModels(make("trail")).tiles.filter((p) => p.road);
    expect(trail.length).toBeGreaterThan(0);
    expect(
      trail.every(
        (p) => p.road!.kerbs.length === 0 && !p.road!.line && !p.road!.junction,
      ),
    ).toBe(true);
  });
});

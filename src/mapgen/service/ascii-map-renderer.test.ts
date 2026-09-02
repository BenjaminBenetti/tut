import { describe, expect, it } from "vitest";

import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import { HookKinds } from "../model/hook";
import { ASCII_LEGEND, renderAscii } from "./ascii-map-renderer";
import { FixtureMapBuilder } from "./fixture-map-builder";

/**
 * 4×3, two levels: a road down x = 1, a floor tile up at (2,1,0), a rock
 * ledge at (0,1,1) reached by a ramp from (0,0,0), a crate and a deploy
 * tile on the south row.
 */
function fixture(): FixtureMapBuilder {
  const b = new FixtureMapBuilder(4, 3, 2).fillGround();
  for (let z = 0; z < 3; z++) {
    b.tile({ x: 1, y: 0, z }, SurfaceIds.ROAD);
  }
  b.tile({ x: 2, y: 1, z: 0 }, SurfaceIds.FLOOR);
  b.tile({ x: 0, y: 1, z: 1 }, SurfaceIds.ROCK);
  b.connector("ramp", { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 1 });
  b.prop(PropKindIds.CRATE, { x: 0, y: 0, z: 2 });
  b.deploy([{ x: 3, y: 0, z: 2 }]);
  return b;
}

describe("renderAscii", () => {
  it("renders a top-down composite with hooks, props, links and surfaces", () => {
    expect(renderAscii(fixture().build())).toBe(
      ['/=_"', '^=""', 'o="D'].join("\n"),
    );
  });

  it("renders a single level with empty cells where nothing exists", () => {
    const map = fixture().build();
    expect(renderAscii(map, { level: 1 })).toBe(
      [".._.", "^...", "...."].join("\n"),
    );
    expect(renderAscii(map, { level: 0 })).toBe(
      ['/=""', '"=""', 'o="D'].join("\n"),
    );
  });

  it("gives objectives precedence over other hooks and uses ! for unknown kinds", () => {
    const map = fixture()
      .objective(HookKinds.EGG_SPAWNER, [{ x: 3, y: 0, z: 2 }])
      .objective("hive-core", [{ x: 3, y: 0, z: 0 }])
      .build();
    const rows = renderAscii(map).split("\n");
    expect(rows[2]?.endsWith("E")).toBe(true);
    expect(rows[0]?.endsWith("!")).toBe(true);
  });

  it("renders unknown surfaces as ? and high cover as O", () => {
    const map = new FixtureMapBuilder(2, 1, 1)
      .tile({ x: 0, y: 0, z: 0 }, "lava")
      .tile({ x: 1, y: 0, z: 0 }, SurfaceIds.GRASS)
      .prop(PropKindIds.BOULDER, { x: 1, y: 0, z: 0 })
      .build();
    expect(renderAscii(map)).toBe("?O");
  });

  it("ships a legend naming every glyph family", () => {
    for (const word of ["grass", "roof", "ramp", "deploy", "egg spawner"]) {
      expect(ASCII_LEGEND).toContain(word);
    }
  });
});

import { describe, expect, it } from "vitest";

import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { previewUnits } from "./preview-units";

describe("previewUnits", () => {
  it("places a squad, the starter mech and a swarmer on the map's hooks", () => {
    const map = new FixtureMapBuilder(8, 8, 1)
      .fillGround()
      .deploy([
        { x: 1, y: 0, z: 1 },
        { x: 2, y: 0, z: 1 },
      ])
      .edgeSpawn([{ x: 7, y: 0, z: 7 }])
      .build();
    const { units, templates } = previewUnits(map);
    expect(units.map((u) => [u.kind, u.pos.x, u.pos.z, u.facing])).toEqual([
      ["squad", 1, 1, "n"],
      ["mech", 2, 1, "n"],
      ["bug", 7, 7, "s"],
    ]);
    for (const unit of units) {
      expect(templates[unit.templateId]).toBeDefined();
    }
    expect(JSON.parse(JSON.stringify({ units, templates }))).toEqual({
      units,
      templates,
    });
  });

  it("skips units that have no tile to stand on", () => {
    const map = new FixtureMapBuilder(4, 4, 1)
      .fillGround()
      .deploy([{ x: 0, y: 0, z: 0 }])
      .build();
    const { units } = previewUnits(map);
    expect(units.map((u) => u.kind)).toEqual(["squad"]);
  });
});

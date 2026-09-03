import { describe, expect, it } from "vitest";

import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { HookKinds } from "../../mapgen/model/hook";
import { previewMission, previewUnits } from "./preview-units";

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

  it("previewMission wraps the units in a player-phase mission with a spawner objective", () => {
    const map = new FixtureMapBuilder(8, 8, 1)
      .fillGround()
      .deploy([{ x: 1, y: 0, z: 1 }])
      .objective(HookKinds.EGG_SPAWNER, [{ x: 6, y: 0, z: 6 }])
      .extraction([{ x: 0, y: 0, z: 7 }])
      .build();
    const mission = previewMission(map);
    expect(mission.phase).toBe("player");
    expect(mission.turn).toBe(1);
    expect(mission.spawners.map((s) => s.pos)).toEqual([{ x: 6, y: 0, z: 6 }]);
    expect(mission.objectives).toEqual([
      {
        id: "objective-1",
        kind: "destroy-spawner",
        targetId: "spawner-1",
        complete: false,
      },
    ]);
    expect(mission.extraction).toEqual([{ x: 0, y: 0, z: 7 }]);
    expect(JSON.parse(JSON.stringify(mission))).toEqual(mission);
  });
});

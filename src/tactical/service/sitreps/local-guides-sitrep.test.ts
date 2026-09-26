import { describe, expect, it } from "vitest";

import { TileIndex } from "../../../mapgen/service/tile-index";
import { NO_VISION } from "../../model/tactical-state";
import { unitAt } from "../tactical-fixtures.test-helper";
import {
  initialVision,
  perceivedSpawners,
  perceivedUnits,
} from "../vision-service";
import { fieldMission } from "./sitrep-fixtures.test-helper";
import { guideTheSquad, localGuidesSitrep } from "./local-guides-sitrep";

/** A bug far out of the squad's sight, and a nest beside it. */
const FAR_BUG = unitAt(
  "bug-1",
  "infantry",
  { x: 20, y: 0, z: 20 },
  { team: "bugs" },
);

describe("localGuidesSitrep", () => {
  it("is a setup hook only", () => {
    const rule = localGuidesSitrep();
    expect(rule.id).toBe("local-guides");
    expect(rule.setup).toBeDefined();
    expect(rule.sight).toBeUndefined();
    expect(rule.phaseStep).toBeUndefined();
  });
});

describe("guideTheSquad", () => {
  it("marks every tile of the map explored for the TDF, sorted", () => {
    const mission = fieldMission(["local-guides"]);
    const out = guideTheSquad(mission, mission.map);
    const index = new TileIndex(mission.map);
    const every = mission.map.tiles.map((t) => index.keyOf(t));
    expect(out.vision.tdf.explored).toHaveLength(every.length);
    expect(new Set(out.vision.tdf.explored)).toEqual(new Set(every));
    expect([...out.vision.tdf.explored]).toEqual(
      [...out.vision.tdf.explored].sort((a, b) => a - b),
    );
  });

  it("gives no sight: nothing visible, nobody spotted, and the bugs learn nothing", () => {
    const mission = fieldMission(["local-guides"]);
    const out = guideTheSquad(mission, mission.map);
    expect(out.vision.tdf.visible).toEqual([]);
    expect(out.vision.tdf.spotted).toEqual([]);
    expect(out.vision.tdf.lastSeen).toEqual({});
    expect(out.vision.bugs).toEqual(NO_VISION);
    expect(mission.vision.tdf.explored).toEqual([]);
  });

  it("survives the first look, which still sees only what is in sight and spots no far bug", () => {
    const mission = fieldMission(["local-guides"], {
      units: [...fieldMission().units, FAR_BUG],
      spawners: [
        {
          id: "spawner-1",
          pos: { x: 21, y: 0, z: 21 },
          hatchRadius: 2,
          hp: 10,
          timer: 3,
          destroyed: false,
        },
      ],
    });
    const guided = guideTheSquad(mission, mission.map);
    const { vision: known, ...placed } = guided;
    const plain = initialVision(placed);
    const looked = { ...guided, vision: initialVision(placed, known) };
    expect(looked.vision.tdf.explored).toHaveLength(mission.map.tiles.length);
    expect(looked.vision.tdf.visible).toEqual(plain.tdf.visible);
    expect(looked.vision.tdf.spotted).toEqual([]);
    expect(perceivedUnits(looked, "tdf").map((u) => u.id)).not.toContain(
      "bug-1",
    );
    // The nest is terrain a guide knows: drawn from explored ground.
    expect(perceivedSpawners(looked, "tdf").map((s) => s.id)).toEqual([
      "spawner-1",
    ]);
    expect(perceivedSpawners({ ...mission, vision: plain }, "tdf")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import { PassMask } from "./pass-mask";
import { MapDraft } from "./map-draft";

function draft(width = 4, depth = 3): MapDraft {
  return new MapDraft(
    width,
    depth,
    new SequentialIdGenerator(),
    SurfaceIds.GRASS,
  );
}

describe("MapDraft", () => {
  it("starts flat on the default surface with no roads or cover", () => {
    const d = draft();
    expect(d.groundLevelAt(3, 2)).toBe(0);
    expect(d.groundSurfaceAt(0, 0)).toBe(SurfaceIds.GRASS);
    expect(d.isRoad(1, 1)).toBe(false);
    expect(d.isCovered(1, 1)).toBe(false);
    expect(d.maxLevel()).toBe(0);
  });

  it("reshapes ground per column and rejects off-map columns", () => {
    const d = draft();
    d.setGroundLevel(1, 2, 3);
    d.setGroundSurface(1, 2, SurfaceIds.ROCK);
    d.setRoad(2, 0);
    d.setCovered(3, 1);
    expect(d.groundCoord(1, 2)).toEqual({ x: 1, y: 3, z: 2 });
    expect(d.groundSurfaceAt(1, 2)).toBe(SurfaceIds.ROCK);
    expect(d.isRoad(2, 0)).toBe(true);
    expect(d.isCovered(3, 1)).toBe(true);
    expect(d.maxLevel()).toBe(3);
    expect(() => d.groundLevelAt(4, 0)).toThrow(/outside 4×3/);
    expect(() => d.setRoad(0, -1)).toThrow(/outside 4×3/);
  });

  it("stores sparse tiles by coordinate and rejects duplicates", () => {
    const d = draft();
    const tile = d.addTile({
      x: 1,
      y: 1,
      z: 1,
      surface: SurfaceIds.FLOOR,
      buildingId: "b",
    });
    expect(d.getTile({ x: 1, y: 1, z: 1 })).toBe(tile);
    expect(() =>
      d.addTile({ x: 1, y: 1, z: 1, surface: SurfaceIds.ROOF }),
    ).toThrow(/already has a tile/);
    expect(d.tilesOfBuilding("b")).toHaveLength(1);
    expect(d.maxLevel()).toBe(1);
    d.removeTile({ x: 1, y: 1, z: 1 });
    expect(d.getTile({ x: 1, y: 1, z: 1 })).toBeUndefined();
    expect([...d.tiles()]).toEqual([]);
  });

  it("knows where a surface exists, ground or sparse", () => {
    const d = draft();
    d.setGroundLevel(0, 0, 2);
    d.addTile({ x: 1, y: 1, z: 0, surface: SurfaceIds.FLOOR });
    d.setCovered(2, 0);
    expect(d.hasSurfaceAt({ x: 0, y: 2, z: 0 })).toBe(true);
    expect(d.hasSurfaceAt({ x: 0, y: 0, z: 0 })).toBe(false);
    expect(d.hasSurfaceAt({ x: 1, y: 1, z: 0 })).toBe(true);
    expect(d.hasSurfaceAt({ x: 2, y: 0, z: 0 })).toBe(false);
    expect(d.hasSurfaceAt({ x: 9, y: 0, z: 0 })).toBe(false);
  });

  it("mirrors walls on the far side and skips the map edge", () => {
    const d = draft();
    d.setWall({ x: 1, y: 0, z: 1 }, "e", "door");
    expect(d.wallAt({ x: 1, y: 0, z: 1 }, "e")).toBe("door");
    expect(d.wallAt({ x: 2, y: 0, z: 1 }, "w")).toBe("door");
    expect(d.wallsAt({ x: 1, y: 0, z: 1 })).toEqual({ e: "door" });

    d.setWall({ x: 0, y: 0, z: 0 }, "w", "solid");
    expect(d.wallAt({ x: 0, y: 0, z: 0 }, "w")).toBe("solid");

    d.setWall({ x: 2, y: 0, z: 1 }, "w", undefined);
    expect(d.wallAt({ x: 1, y: 0, z: 1 }, "e")).toBeUndefined();
    expect(d.wallsAt({ x: 1, y: 0, z: 1 })).toEqual({});
  });

  it("places, finds and removes props with sequential ids", () => {
    const d = draft();
    const crate = d.addProp(PropKindIds.CRATE, { x: 0, y: 0, z: 0 });
    const car = d.addProp(PropKindIds.CAR, { x: 1, y: 0, z: 0 }, 2);
    expect(crate.id).toBe("prop-1");
    expect(car.id).toBe("prop-2");
    expect(car.rotation).toBe(2);
    expect(d.propAt({ x: 1, y: 0, z: 0 })).toBe(car);
    expect(() => d.addProp(PropKindIds.CRATE, { x: 0, y: 0, z: 0 })).toThrow(
      /already has a prop/,
    );
    d.removeProp("prop-1");
    expect(d.propAt({ x: 0, y: 0, z: 0 })).toBeUndefined();
    expect(d.props.map((p) => p.id)).toEqual(["prop-2"]);
    d.removeProp("nope");
    expect(d.props).toHaveLength(1);
  });

  it("adds connectors with the kind's pass mask", () => {
    const d = draft();
    const ramp = d.addConnector(
      "ramp",
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    );
    const stairs = d.addConnector(
      "stairs",
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 1, z: 0 },
      "b1",
    );
    expect(ramp.id).toBe("ramp-1");
    expect(ramp.pass).toBe(PassMask.ALL);
    expect(stairs.pass).toBe(PassMask.INFANTRY);
    expect(stairs.buildingId).toBe("b1");
    expect("buildingId" in ramp).toBe(false);
    expect(d.connectors).toHaveLength(2);
  });

  it("groups hooks and copies their tiles", () => {
    const d = draft();
    const tiles = [{ x: 0, y: 0, z: 0 }];
    const deploy = d.addHook("deployZones", "deploy", tiles, PassMask.ALL);
    const egg = d.addHook(
      "objectives",
      "egg-spawner",
      tiles,
      PassMask.INFANTRY,
      {
        hatchRadius: 3,
      },
    );
    const extraction = d.setExtraction(tiles, PassMask.ALL);
    expect(d.hooks.deployZones).toEqual([deploy]);
    expect(d.hooks.objectives[0]?.meta).toEqual({ hatchRadius: 3 });
    expect(d.hooks.extraction).toBe(extraction);
    expect(egg.tiles).toEqual(tiles);
    expect(egg.tiles).not.toBe(tiles);
    expect([deploy.id, egg.id, extraction.id]).toEqual([
      "hook-1",
      "hook-2",
      "hook-3",
    ]);
  });
});

/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DIRECTIONS } from "../../core/model/direction";
import { rectContains } from "../../core/service/grid-math";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { HookKinds } from "../../mapgen/model/hook";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import {
  dropshipBoardingTiles,
  dropshipFootprint,
} from "../../mapgen/service/dropship-site-layout";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { tileTop } from "../view/tactical-map-view";
import { resolveDropshipModels } from "./dropship-model-resolver";
import { resolveForwardDropships } from "./forward-dropship-resolver";
import { resolveMapModels, mapModelIds } from "./map-model-resolver";

/** Reads the authored contact nodes from the real GLB; no geometry is fabricated for this check. */
function contactSockets(): readonly {
  name: string;
  translation: readonly number[];
}[] {
  const glb = readFileSync(
    new URL(
      MODEL_MANIFEST["tdf.dropship"].path,
      new URL("../../../public/", import.meta.url),
    ),
  );
  const length = glb.readUInt32LE(12);
  const document = JSON.parse(
    glb.subarray(20, 20 + length).toString("utf8"),
  ) as { nodes: { name: string; translation?: number[] }[] };
  return document.nodes
    .filter((n) => n.name.startsWith("socket_"))
    .map((n) => ({ name: n.name, translation: n.translation ?? [0, 0, 0] }));
}

describe("dropship scene mapping", () => {
  it.each(DIRECTIONS)(
    "grounds Art's actual foot and ramp sockets when facing %s",
    (facing) => {
      const vertical = facing === "n" || facing === "s";
      const clearance = {
        x: 4,
        z: 5,
        w: vertical ? 7 : 13,
        d: vertical ? 13 : 7,
      };
      const footprint = dropshipFootprint(clearance, facing);
      const tiles = dropshipBoardingTiles(clearance, facing, 2);
      const map = new FixtureMapBuilder(24, 24, 4)
        .fillGround(2)
        .deploy(tiles)
        .build();
      const zone = map.hooks.deployZones[0]!;
      const placed = {
        ...map,
        hooks: {
          ...map.hooks,
          deployZones: [{ ...zone, requiredPass: PassMask.ALL }],
        },
        dropships: [
          { deployZoneId: zone.id, footprint, clearance, facing, level: 2 },
        ],
      };
      const [model] = resolveDropshipModels(placed);
      expect(model).toBeDefined();
      expect(model!.position).toEqual({
        x: footprint.x + footprint.w / 2,
        y: 1.65,
        z: footprint.z + footprint.d / 2,
      });
      expect(
        model!.position.x ===
          tiles.reduce((n, p) => n + p.x + 0.5, 0) / tiles.length &&
          model!.position.z ===
            tiles.reduce((n, p) => n + p.z + 0.5, 0) / tiles.length,
      ).toBe(false);
      expect(mapModelIds(resolveMapModels(placed))).toContain("tdf.dropship");
      const angle = (-model!.turns * Math.PI) / 2;
      const sockets = contactSockets();
      expect(sockets).toHaveLength(5);
      for (const socket of sockets) {
        const [x, y, z] = socket.translation as [number, number, number];
        const world = {
          x: model!.position.x + x * Math.cos(angle) + z * Math.sin(angle),
          y: model!.position.y + y,
          z: model!.position.z - x * Math.sin(angle) + z * Math.cos(angle),
        };
        expect(world.y).toBeCloseTo(1.65);
        expect(world.x).toBeGreaterThanOrEqual(footprint.x - 1e-6);
        expect(world.x).toBeLessThanOrEqual(footprint.x + footprint.w + 1e-6);
        expect(world.z).toBeGreaterThanOrEqual(footprint.z - 1e-6);
        expect(world.z).toBeLessThanOrEqual(footprint.z + footprint.d + 1e-6);
        if (socket.name.startsWith("socket_ramp")) {
          const inward = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[
            facing
          ];
          expect(
            tiles.some(
              (p) =>
                Math.floor(world.x + inward[0]! * 0.001) === p.x &&
                Math.floor(world.z + inward[1]! * 0.001) === p.z,
            ),
          ).toBe(true);
        } else {
          expect(
            rectContains(clearance, Math.floor(world.x), Math.floor(world.z)),
          ).toBe(true);
        }
      }
      expect(MODEL_MANIFEST[model!.modelId].footprint).toEqual({ w: 5, d: 7 });
    },
  );

  it("sets a forward point's ship on its berth, held its lift above the floor (#1179)", () => {
    // A passage the point's width with banks a layer up: the ship
    // cannot land, so it holds a layer up over the bank.
    const point: TileCoord[] = [];
    for (let z = 10; z < 14; z++) {
      for (let x = 10; x < 14; x++) point.push({ x, y: 2, z });
    }
    const builder = new FixtureMapBuilder(24, 24, 6).fillGround(2);
    for (let z = 0; z < 24; z++) {
      for (let x = 0; x < 24; x++) {
        if (x >= 10 && x < 14) continue;
        builder
          .removeTile({ x, y: 2, z })
          .tile({ x, y: 3, z }, SurfaceIds.ROCK);
      }
    }
    const map = builder
      .deploy([{ x: 11, y: 2, z: 20 }])
      .objective(HookKinds.FORWARD_EXTRACTION, point, PassMask.ALL)
      .build();
    const [ship] = resolveForwardDropships(map);
    expect(ship).toBeDefined();
    expect(ship!.lift).toBe(1);
    const models = resolveDropshipModels(map);
    expect(models).toEqual([
      {
        modelId: "tdf.dropship",
        level: 2,
        position: {
          x: ship!.footprint.x + ship!.footprint.w / 2,
          y: tileTop(3),
          z: ship!.footprint.z + ship!.footprint.d / 2,
        },
        turns: { s: 0, w: 1, n: 2, e: 3 }[ship!.facing],
        tile: point[0],
        occupiedTiles: ship!.occupiedTiles,
      },
    ]);
    expect(mapModelIds(resolveMapModels(map))).toContain("tdf.dropship");
  });
});

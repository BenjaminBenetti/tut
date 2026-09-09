import { describe, expect, it } from "vitest";
import { DIRECTIONS } from "../../core/model/direction";
import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import { rectContains } from "../../core/service/grid-math";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { SurfaceIds } from "../data/surfaces";
import type { GenerationContext } from "../model/generation-pass";
import { MapDraft } from "../model/map-draft";
import { PassMask } from "../model/pass-mask";
import { createDefaultRegistries } from "../service/default-registries";
import { resolveMapGenParams } from "../service/param-resolver";
import { dropshipFootprint } from "../service/dropship-site-layout";
import { DropshipSitePass } from "./dropship-site-pass";

/** One isolated strip of real land; every other candidate is water. */
function fixture(facing: Direction): {
  context: GenerationContext;
  land: Rect;
} {
  const draft = new MapDraft(
    32,
    32,
    new SequentialIdGenerator(),
    SurfaceIds.WATER,
  );
  const vertical = facing === "n" || facing === "s";
  const land = {
    x: vertical ? 10 : facing === "w" ? 0 : 19,
    z: !vertical ? 10 : facing === "n" ? 0 : 19,
    w: vertical ? 7 : 13,
    d: vertical ? 13 : 7,
  };
  for (let z = land.z; z < land.z + land.d; z++)
    for (let x = land.x; x < land.x + land.w; x++) {
      draft.setGroundSurface(x, z, SurfaceIds.GRASS);
      draft.setGroundLevel(x, z, 2);
    }
  const registries = createDefaultRegistries();
  return {
    land,
    context: {
      draft,
      registries,
      rng: new Mulberry32Rng(17),
      diagnostics: { note: () => undefined },
      params: resolveMapGenParams(
        {
          archetype: "settlement",
          biome: "temperate",
          settlement: "rural",
          size: { width: 32, depth: 32 },
          hooks: [{ kind: "deploy", count: 1, requiredPass: PassMask.ALL }],
        },
        registries,
      ),
    },
  };
}

describe("DropshipSitePass", () => {
  it.each(DIRECTIONS)(
    "grounds the complete envelope and external boarding on edge %s",
    (facing) => {
      const { context, land } = fixture(facing);
      new DropshipSitePass().run(context);
      const { draft } = context;
      expect(draft.dropships).toHaveLength(1);
      const site = draft.dropships[0]!;
      expect(site).toMatchObject({
        facing,
        level: 2,
        clearance: land,
        footprint: dropshipFootprint(land, facing),
      });
      const tiles = draft.hooks.deployZones[0]!.tiles;
      expect(tiles).toHaveLength(16);
      expect(new Set(tiles.map((p) => draft.tileKey(p))).size).toBe(16);
      for (const tile of tiles) {
        expect(rectContains(site.footprint, tile.x, tile.z)).toBe(false);
        expect(draft.groundLevelAt(tile.x, tile.z)).toBe(2);
        expect(draft.isDropshipHull(tile.x, tile.z)).toBe(false);
      }
      for (let z = land.z; z < land.z + land.d; z++)
        for (let x = land.x; x < land.x + land.w; x++)
          expect(draft.groundLevelAt(x, z)).toBe(2);
    },
  );

  it("cuts the higher half of a sloped clearing instead of raising a plinth", () => {
    const { context, land } = fixture("n");
    for (let z = 0; z < 6; z++)
      for (let x = land.x; x < land.x + land.w; x++)
        context.draft.setGroundLevel(x, z, 3);
    new DropshipSitePass().run(context);
    expect(context.draft.dropships[0]?.level).toBe(2);
    for (let z = 0; z < 12; z++)
      for (let x = land.x; x < land.x + land.w; x++)
        expect(context.draft.groundLevelAt(x, z)).toBe(2);
    expect(context.draft.groundSurfaceAt(land.x - 1, 0)).toBe(SurfaceIds.WATER);
    expect(context.draft.groundLevelAt(land.x - 1, 0)).toBe(0);
  });

  it("rejects a road through the only envelope rather than clipping the aircraft", () => {
    const { context, land } = fixture("n");
    context.draft.setRoad(land.x + 3, 4);
    new DropshipSitePass().run(context);
    expect(context.draft.dropships).toEqual([]);
    expect(context.draft.hooks.deployZones).toEqual([]);
    expect(context.draft.requiresDropships).toBe(true);
    expect(context.draft.isRoad(land.x + 3, 4)).toBe(true);
  });
});

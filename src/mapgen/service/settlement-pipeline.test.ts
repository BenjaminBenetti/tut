import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../core/model/elevation";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SurfaceIds } from "../data/surfaces";
import type { GenerationPass } from "../model/generation-pass";
import { HookKinds } from "../model/hook";
import type { MapRecipe } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import type { WallKind } from "../model/wall";
import { createDefaultRegistries } from "./default-registries";
import { freezeDraft } from "./draft-freezer";
import { validateTacticalMap } from "./map-validator";
import {
  PipelineMapGenerator,
  validatePipeline,
} from "./pipeline-map-generator";
import { createPipeline, createSettlementPasses } from "./settlement-pipeline";
import { TileIndex } from "./tile-index";

describe("settlement pipeline", () => {
  it("lists the ADR 0004 passes in order with satisfied requirements", () => {
    const passes = createSettlementPasses();
    expect(passes.map((p) => p.id)).toEqual([
      "terrain",
      "water",
      "roads",
      "dropship-sites",
      "lots",
      "elevation",
      "buildings",
      "interiors",
      "waterfronts",
      "props",
      "slopes",
      "ramps",
      "kerbs",
      "rural-fences",
      "yard-arrangements",
      "hooks",
      "connectivity",
    ]);
    expect(() => {
      validatePipeline(passes);
    }).not.toThrow();
    expect(passes[passes.length - 1]?.provides).toEqual(["connected"]);
  });

  it("builds a fresh pipeline per call", () => {
    const registries = createDefaultRegistries();
    const a = createPipeline("settlement", registries);
    const b = createPipeline("settlement", registries);
    expect(a).not.toBe(b);
    expect(a.passIds).toEqual(b.passIds);
  });

  it.each([
    { atFoot: false, sideWall: "solid" },
    { atFoot: true, sideWall: "window" },
    { atFoot: true, sideWall: "door" },
  ] as const)(
    "clears the repaired kerb (at foot: $atFoot), preserving the flanking $sideWall wall",
    ({ atFoot, sideWall }) => {
      const { map, notes } = pavedCliff(false, atFoot, sideWall);
      // Connectivity alone reports success even when a wall crosses the ramp.
      expect(validateTacticalMap(map, createDefaultRegistries())).toEqual([]);
      expect(notes.some((note) => note.includes("added ramp"))).toBe(true);
      expect(map.connectors).toHaveLength(1);
      const ramp = map.connectors[0]!;
      const index = new TileIndex(map);
      expect(ramp.from.x).toBe(9);
      expect(ramp.to.x).toBe(10);
      expect(ramp.to.y - ramp.from.y).toBe(STOREY_LAYERS);
      expect(index.getAt(ramp.from)?.walls.e).toBeUndefined();
      expect(
        index.getAt(ramp.to)?.walls.w,
        JSON.stringify(ramp),
      ).toBeUndefined();
      expect(index.getAt(ramp.to)?.walls.n).toBe(sideWall);
      for (let z = 0; z < map.depth; z++) {
        if (z === ramp.to.z) continue;
        expect(
          atFoot
            ? index.get(9, 0, z)?.walls.e
            : index.get(10, STOREY_LAYERS, z)?.walls.w,
        ).toBe("half");
      }
    },
  );

  it("preserves an already-connected map and walls every other paved cliff edge", () => {
    const { map, notes } = pavedCliff(true);
    expect(validateTacticalMap(map, createDefaultRegistries())).toEqual([]);
    expect(notes.some((note) => note.includes("added ramp"))).toBe(false);
    expect(map.connectors).toHaveLength(1);
    const index = new TileIndex(map);
    for (let z = 0; z < map.depth; z++) {
      expect(index.get(10, STOREY_LAYERS, z)?.walls.w).toBe(
        z === 10 ? undefined : "half",
      );
    }
    expect(map.hooks.objectives[0]?.tiles).toEqual([
      { x: 15, y: STOREY_LAYERS, z: 10 },
    ]);
  });
});

/** A paved road cut, with the real kerb/connectivity passes in production order. */
function pavedCliff(
  alreadyConnected: boolean,
  atFoot = false,
  sideWall?: WallKind,
) {
  const registries = createDefaultRegistries();
  const recipe: MapRecipe = {
    seed: "kerb-connectivity-repair",
    params: {
      archetype: "settlement",
      biome: "temperate",
      settlement: "town",
      size: { width: 20, depth: 20 },
      hooks: [],
    },
  };
  const fixture: GenerationPass = {
    id: "paved-cliff",
    requires: [],
    provides: ["ramps", "hooks"],
    run: ({ draft }) => {
      for (let z = 0; z < draft.depth; z++) {
        draft.setGroundSurface(9, z, SurfaceIds.ROAD);
        for (let x = 10; x < draft.width; x++)
          draft.setGroundLevel(x, z, STOREY_LAYERS);
        if (atFoot) draft.setWall({ x: 9, y: 0, z }, "e", "half");
        if (sideWall)
          draft.setWall({ x: 10, y: STOREY_LAYERS, z }, "n", sideWall);
      }
      const deploy = [];
      for (let z = 1; z <= 4; z++)
        for (let x = 1; x <= 4; x++) deploy.push({ x, y: 0, z });
      draft.addHook("deployZones", HookKinds.DEPLOY, deploy, PassMask.ALL);
      draft.addHook(
        "edgeSpawns",
        HookKinds.EDGE_SPAWN,
        [{ x: 0, y: 0, z: 10 }],
        PassMask.ALL,
      );
      draft.addHook(
        "objectives",
        HookKinds.EGG_SPAWNER,
        [{ x: 15, y: STOREY_LAYERS, z: 10 }],
        PassMask.ALL,
      );
      if (alreadyConnected)
        draft.addConnector(
          "ramp",
          { x: 9, y: 0, z: 10 },
          { x: 10, y: STOREY_LAYERS, z: 10 },
        );
    },
  };
  const tail = createSettlementPasses().filter((p) =>
    ["kerbs", "connectivity"].includes(p.id),
  );
  const result = new PipelineMapGenerator([fixture, ...tail], registries).run(
    recipe.params,
    new Mulberry32Rng(869),
  );
  return {
    map: freezeDraft(result.draft, recipe, registries),
    notes: result.diagnostics.notes
      .filter((note) => note.pass === "connectivity")
      .map((note) => note.message),
  };
}

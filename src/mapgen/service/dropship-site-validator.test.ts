import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import type { MapGenParams } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import type { TacticalMap } from "../model/tactical-map";
import { generateTacticalMap } from "./generate-tactical-map";
import { validateDropshipSites } from "./dropship-site-validator";
import { TileIndex } from "./tile-index";
import { hatchSpace } from "../generator/placer/placer-support";
import { HATCH_SPACE_MIN } from "../generator/placer/egg-spawner-placer";
import { ReachabilityService } from "./reachability-service";

let map: TacticalMap;
beforeAll(() => {
  map = generateTacticalMap({
    seed: "mc-resume-01",
    params: {
      archetype: "settlement",
      biome: "temperate",
      settlement: "rural",
      size: "small",
      hooks: DEFAULT_MISSION_HOOKS,
    },
  });
});

/** Runs the final-map obligation against the altered data, not the planner's assumptions. */
function check(candidate: TacticalMap): readonly string[] {
  return validateDropshipSites(candidate, new TileIndex(candidate)).map(
    (v) => v.message,
  );
}

describe("dropship final support validation", () => {
  it("accepts the actual generated boarding/aircraft separation", () => {
    expect(map.dropships).toHaveLength(1);
    expect(check(map)).toEqual([]);
  });

  it("rejects a missing support tile or a passable hull introduced downstream", () => {
    const { footprint, level } = map.dropships![0]!;
    const hullTile = (t: { x: number; y: number; z: number }): boolean =>
      t.x === footprint.x && t.z === footprint.z && t.y === level;
    expect(
      check({ ...map, tiles: map.tiles.filter((t) => !hullTile(t)) }).join(" "),
    ).toContain("support/clearance is obstructed");
    expect(
      check({
        ...map,
        tiles: map.tiles.map((t) =>
          hullTile(t) ? { ...t, pass: PassMask.ALL } : t,
        ),
      }).join(" "),
    ).toContain("pass/sight mask disagrees");
  });

  it("rejects unit starts moved under the aircraft even when they still number sixteen", () => {
    const site = map.dropships![0]!;
    const zone = map.hooks.deployZones[0]!;
    const changed = {
      ...zone,
      tiles: [
        { x: site.footprint.x, y: site.level, z: site.footprint.z },
        ...zone.tiles.slice(1),
      ],
    };
    expect(
      check({ ...map, hooks: { ...map.hooks, deployZones: [changed] } }).join(
        " ",
      ),
    ).toContain("external boarding columns");
  });

  it("accepts an old map without a dropship record", () => {
    const { dropships: _dropships, ...old } = map;
    expect(check(old)).toEqual([]);
  });

  it.each([
    {
      seed: 'wide-"small"/snowy/rural/5',
      biome: "snowy",
      settlement: "rural",
      size: "small",
    },
    {
      seed: 'wide-"small"/snowy/town/18',
      biome: "snowy",
      settlement: "town",
      size: "small",
    },
    {
      seed: 'wide-{"width":40,"depth":56}/snowy/rural/1',
      biome: "snowy",
      settlement: "rural",
      size: { width: 40, depth: 56 },
    },
    {
      seed: 'wide-{"width":40,"depth":56}/snowy/rural/17',
      biome: "snowy",
      settlement: "rural",
      size: { width: 40, depth: 56 },
    },
    {
      seed: 'wide-{"width":40,"depth":56}/snowy/town/3',
      biome: "snowy",
      settlement: "town",
      size: { width: 40, depth: 56 },
    },
    {
      seed: 'wide-{"width":40,"depth":56}/snowy/town/5',
      biome: "snowy",
      settlement: "town",
      size: { width: 40, depth: 56 },
    },
    {
      seed: 'wide-{"width":40,"depth":56}/snowy/town/9',
      biome: "snowy",
      settlement: "town",
      size: { width: 40, depth: 56 },
    },
    {
      seed: 'wide-{"width":40,"depth":56}/snowy/town/10',
      biome: "snowy",
      settlement: "town",
      size: { width: 40, depth: 56 },
    },
    { seed: "mc-resume-03", biome: "snowy", settlement: "town", size: "small" },
  ])(
    "supports the measured snowy fallback $settlement / $seed",
    ({ seed, settlement, size }) => {
      const changed = generateTacticalMap({
        seed,
        params: {
          ...map.recipe.params,
          biome: "snowy",
          settlement: settlement as MapGenParams["settlement"],
          size: size as MapGenParams["size"],
        },
      });
      expect(changed.dropships).toHaveLength(1);
      expect(check(changed)).toEqual([]);
    },
  );

  it("keeps hatch room when the new boarding origin exposes a cramped indoor preference", () => {
    const changed = generateTacticalMap({
      seed: "sweep-small/desert/rural/0",
      params: { ...map.recipe.params, biome: "desert" },
    });
    const index = new TileIndex(changed);
    const reach = new ReachabilityService(index, changed.connectors);
    for (const hook of changed.hooks.objectives) {
      expect(
        hatchSpace(
          { index, reach },
          hook.tiles[0]!,
          Number(hook.meta?.hatchRadius),
          PassMask.INFANTRY,
        ),
      ).toBeGreaterThanOrEqual(HATCH_SPACE_MIN);
    }
  });
});

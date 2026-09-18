import { describe, expect, it } from "vitest";
import { rectContains } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { BIOME_DEFINITIONS } from "../../data/biomes";
import { DEFAULT_MISSION_HOOKS } from "../../data/hook-requirements";
import { PropKindIds } from "../../data/props";
import { SETTLEMENT_DEFINITIONS } from "../../data/settlements";
import { SurfaceIds } from "../../data/surfaces";
import type { GenerationContext } from "../../model/generation-pass";
import type { InfestationZone } from "../../model/infestation-plan";
import { MapDraft } from "../../model/map-draft";
import { PassMask } from "../../model/pass-mask";
import type { TacticalMap } from "../../model/tactical-map";
import { createDefaultRegistries } from "../../service/default-registries";
import { DiagnosticsCollector } from "../../service/diagnostics-collector";
import { generateTacticalMap } from "../../service/generate-tactical-map";
import { placeCarapaceSite, planCarapaceSites } from "./carapace-sites";

/** Four separate colony cores on dry, fully infested terrain. */
function fixture(level = 10): GenerationContext {
  const draft = new MapDraft(
    32,
    32,
    new SequentialIdGenerator(),
    SurfaceIds.INFESTED,
  );
  const zones: InfestationZone[] = [
    { x: 7, z: 7 },
    { x: 23, z: 7 },
    { x: 7, z: 23 },
    { x: 23, z: 23 },
  ].map((centre, index) => ({
    id: `colony-${index}`,
    centre,
    radius: 13.5,
    clearingRadius: 4.4,
    maturity: "hive",
  }));
  draft.infestation = {
    level,
    zones,
    corridors: [],
    ruins: [],
    influence: Array<number>(32 * 32).fill(1),
  };
  return {
    draft,
    registries: createDefaultRegistries(),
    rng: new Mulberry32Rng(71),
    diagnostics: new DiagnosticsCollector().forPass("carapace-sites"),
    params: {
      archetype: "settlement",
      width: 32,
      depth: 32,
      biome: BIOME_DEFINITIONS.temperate,
      settlement: SETTLEMENT_DEFINITIONS.town,
      hooks: [],
      slopeShare: 1,
      infestation: level,
    },
  };
}

/** Final physical bounds, including a complete open circulation ring. */
function expectSafeBuildings(map: TacticalMap): void {
  const buildings = map.props.filter((prop) =>
    prop.kind.startsWith("infested-carapace-"),
  );
  const ground = new Map(
    map.tiles
      .filter((tile) => tile.buildingId === undefined)
      .map((tile) => [`${tile.x}:${tile.z}`, tile]),
  );
  expect(buildings.length).toBeGreaterThan(0);
  expect(buildings.length).toBeLessThanOrEqual(
    Math.ceil(map.infestation!.zones.length / 2),
  );
  const used = new Set<string>();
  for (const building of buildings) {
    const cells = building.occupiedTiles!;
    const site = map.infestation!.zones.find(
      (zone) =>
        zone.carapace !== undefined &&
        cells.every((tile) =>
          rectContains(zone.carapace!.footprint, tile.x, tile.z),
        ),
    );
    expect(site).toBeDefined();
    expect(used.has(site!.id)).toBe(false);
    used.add(site!.id);
    for (const cell of cells) {
      const tile = ground.get(`${cell.x}:${cell.z}`)!;
      expect(tile.y).toBe(building.tile.y);
      expect(tile.surface).toBe(SurfaceIds.INFESTED);
      expect(tile.slope).toBeUndefined();
      expect(tile.propId).toBe(building.id);
      expect(tile.pass).toBe(PassMask.NONE);
      expect(
        map.infestation!.influence[cell.z * map.width + cell.x],
      ).toBeGreaterThanOrEqual(0.55);
      for (const other of map.props.filter((prop) => prop.id !== building.id))
        expect(
          (other.occupiedTiles ?? [other.tile]).some(
            (position) => position.x === cell.x && position.z === cell.z,
          ),
        ).toBe(false);
    }
    const minX = Math.min(...cells.map((tile) => tile.x));
    const maxX = Math.max(...cells.map((tile) => tile.x));
    const minZ = Math.min(...cells.map((tile) => tile.z));
    const maxZ = Math.max(...cells.map((tile) => tile.z));
    for (let z = minZ - 1; z <= maxZ + 1; z++)
      for (let x = minX - 1; x <= maxX + 1; x++) {
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) continue;
        const ring = ground.get(`${x}:${z}`)!;
        expect(ring.propId).toBeUndefined();
        expect(ring.pass).toBe(PassMask.ALL);
        expect(Object.keys(ring.walls)).toHaveLength(0);
      }
  }
}

describe("carapace colony sites", () => {
  it.each([0, 1, 4, 5])(
    "does not reserve or grade terrain at infestation %s",
    (level) => {
      const context = fixture(level);
      const before = context.draft.infestation!.zones;
      expect(planCarapaceSites(context, before)).toBe(before);
      expect(context.draft.groundLevelAt(7, 7)).toBe(0);
    },
  );

  it("grades at most one layer only within the selected half of colony platforms", () => {
    const context = fixture();
    context.draft.setGroundLevel(7, 7, 1);
    context.draft.setGroundLevel(7, 23, 1);
    const before = Array.from({ length: 32 * 32 }, (_, index) =>
      context.draft.groundLevelAt(index % 32, Math.floor(index / 32)),
    );
    const zones = planCarapaceSites(context, context.draft.infestation!.zones);
    const sites = zones.flatMap((zone) =>
      zone.carapace === undefined ? [] : [zone.carapace],
    );
    expect(sites).toHaveLength(2);
    for (let z = 0; z < 32; z++)
      for (let x = 0; x < 32; x++) {
        const change = Math.abs(
          context.draft.groundLevelAt(x, z) - before[z * 32 + x]!,
        );
        expect(change).toBeLessThanOrEqual(1);
        if (change !== 0)
          expect(sites.some((site) => rectContains(site.clearance, x, z))).toBe(
            true,
          );
      }
    expect(context.draft.groundLevelAt(7, 23)).toBe(1);
  });

  it("declines water and small fragmented patches without mutating terrain", () => {
    const context = fixture();
    for (let z = 0; z < 32; z++)
      for (let x = 0; x < 32; x++)
        context.draft.setGroundSurface(x, z, SurfaceIds.WATER);
    const zones = planCarapaceSites(context, context.draft.infestation!.zones);
    expect(zones.every((zone) => zone.carapace === undefined)).toBe(true);
    for (let z = 5; z < 9; z++)
      for (let x = 5; x < 9; x++)
        context.draft.setGroundSurface(x, z, SurfaceIds.INFESTED);
    expect(
      planCarapaceSites(context, context.draft.infestation!.zones).every(
        (zone) => zone.carapace === undefined,
      ),
    ).toBe(true);
    expect(planCarapaceSites(context, [])).toEqual([]);
  });

  it("shrinks within an existing pad to preserve a firing line and declines a fully protected pad", () => {
    const context = fixture();
    const site = {
      kind: PropKindIds.INFESTED_CARAPACE_KEEP,
      footprint: { x: 5, z: 5, w: 4, d: 4 },
      clearance: { x: 4, z: 4, w: 6, d: 6 },
      level: 0,
      rotation: 0 as const,
    };
    const protectedColumns = new Set(
      Array.from({ length: 32 }, (_, x) => 5 * 32 + x),
    );
    expect(placeCarapaceSite(context, site, protectedColumns)).toBe(true);
    const building = context.draft.props[0]!;
    expect(building.kind).not.toBe(PropKindIds.INFESTED_CARAPACE_KEEP);
    expect(building.occupiedTiles!.every((tile) => tile.z > 5)).toBe(true);
    const blocked = fixture();
    expect(
      placeCarapaceSite(
        blocked,
        site,
        new Set(Array.from({ length: 32 * 32 }, (_, index) => index)),
      ),
    ).toBe(false);
    expect(blocked.draft.props).toHaveLength(0);
  });

  it.each([
    { seed: "infestation-review", infestation: 10 },
    { seed: "carapace-0", infestation: 6 },
    { seed: "carapace-0", infestation: 10 },
  ])(
    "builds safe landmarks in $seed at level $infestation",
    ({ seed, infestation }) => {
      const recipe = {
        seed,
        params: {
          archetype: "settlement" as const,
          biome: "temperate" as const,
          settlement: "town" as const,
          size: "small" as const,
          hooks: DEFAULT_MISSION_HOOKS,
          infestation,
        },
      };
      const map = generateTacticalMap(recipe);
      expectSafeBuildings(map);
      expect(generateTacticalMap(recipe)).toEqual(map);
      if (infestation < 8)
        expect(
          map.props.some(
            (prop) => prop.kind === PropKindIds.INFESTED_CARAPACE_KEEP,
          ),
        ).toBe(false);
      if (seed === "carapace-0" && infestation === 10)
        expect(
          map.props.some(
            (prop) => prop.kind === PropKindIds.INFESTED_CARAPACE_KEEP,
          ),
        ).toBe(true);
      expect(
        map.props.some((prop) =>
          [
            PropKindIds.INFESTED_HIVE,
            PropKindIds.INFESTED_BROOD,
            PropKindIds.INFESTED_NEST,
          ].some((kind) => kind === prop.kind),
        ),
      ).toBe(true);
    },
    20000,
  );
});

import { describe, expect, it } from "vitest";
import { DIRECTIONS } from "../../../core/model/direction";
import { stepGridPos } from "../../../core/service/grid-math";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { BIOME_DEFINITIONS } from "../../data/biomes";
import { DEFAULT_MISSION_HOOKS } from "../../data/hook-requirements";
import { SETTLEMENT_DEFINITIONS } from "../../data/settlements";
import { SurfaceIds } from "../../data/surfaces";
import type { GenerationContext } from "../../model/generation-pass";
import type {
  CarapaceSite,
  InfestationZone,
} from "../../model/infestation-plan";
import { MapDraft } from "../../model/map-draft";
import { PassMask } from "../../model/pass-mask";
import type { TacticalMap } from "../../model/tactical-map";
import { createDefaultRegistries } from "../../service/default-registries";
import { DiagnosticsCollector } from "../../service/diagnostics-collector";
import { generateTacticalMap } from "../../service/generate-tactical-map";
import {
  columnKey,
  createCarapaceOutline,
  stepColumn,
} from "./carapace-outline";
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

/** Compares the semantic wall graph with real, individually occupied tiles and open chambers. */
function expectAssembledSite(map: TacticalMap, site: CarapaceSite): void {
  const ground = new Map(
    map.tiles
      .filter((tile) => tile.buildingId === undefined)
      .map((tile) => [columnKey(tile), tile]),
  );
  const cells = new Map(site.cells.map((cell) => [columnKey(cell.tile), cell]));
  expect(site.cells.length).toBeGreaterThanOrEqual(12);
  for (const cell of site.cells) {
    const tile = ground.get(columnKey(cell.tile))!;
    const prop = map.props.find((candidate) => candidate.id === tile.propId)!;
    expect(prop).toBeDefined();
    expect(prop.kind).toBe(cell.kind);
    expect(prop.rotation).toBe(cell.rotation);
    expect(prop.occupiedTiles ?? [prop.tile]).toEqual([cell.tile]);
    expect(tile.y).toBe(cell.tile.y);
    expect(tile.surface).toBe(SurfaceIds.INFESTED);
    expect(tile.pass).toBe(PassMask.NONE);
    expect(cell.joins.length).toBeGreaterThanOrEqual(1);
    expect(cell.joins.length).toBeLessThanOrEqual(3);
    expect(cell.joins).toEqual(
      DIRECTIONS.filter((direction) =>
        cells.has(columnKey(stepGridPos(cell.tile, direction))),
      ),
    );
    for (const direction of cell.joins) {
      const next = cells.get(columnKey(stepGridPos(cell.tile, direction)))!;
      expect(Math.abs(next.tile.y - cell.tile.y)).toBeLessThanOrEqual(1);
    }
  }
  expect(site.courtyard.length).toBeGreaterThanOrEqual(12);
  for (const tile of [
    ...site.courtyard,
    ...site.gateways.flatMap((gate) => gate.approach),
  ]) {
    const actual = ground.get(columnKey(tile))!;
    expect(actual.propId).toBeUndefined();
    expect(actual.pass).toBe(PassMask.ALL);
    expect(Object.keys(actual.walls)).toHaveLength(0);
  }
  expect(site.gateways).toHaveLength(2);
  for (const gate of site.gateways) {
    expect(gate.tiles).toHaveLength(2);
    expect(gate.approach).toHaveLength(10);
    expect(
      new Set(gate.approach.map((tile) => ground.get(columnKey(tile))!.y)).size,
    ).toBe(1);
  }
}

describe("modular carapace colony sites", () => {
  it.each([0, 1, 4, 5])(
    "does not reserve or grade terrain at infestation %s",
    (level) => {
      const context = fixture(level);
      const before = context.draft.infestation!.zones;
      expect(planCarapaceSites(context, before)).toBe(before);
      expect(context.draft.groundLevelAt(7, 7)).toBe(0);
    },
  );

  it("limits formation reservations to half the colonies and grades only their narrow gateway channels", () => {
    const context = fixture();
    for (let z = 0; z < 32; z++)
      for (let x = 16; x < 32; x++) context.draft.setGroundLevel(x, z, 1);
    const before = Array.from({ length: 32 * 32 }, (_, index) =>
      context.draft.groundLevelAt(index % 32, Math.floor(index / 32)),
    );
    const zones = planCarapaceSites(context, context.draft.infestation!.zones);
    const sites = zones.flatMap((zone) =>
      zone.carapace === undefined ? [] : [zone.carapace],
    );
    expect(sites).toHaveLength(2);
    const channels = new Set(
      sites.flatMap((site) => site.passage.map(columnKey)),
    );
    for (let z = 0; z < 32; z++)
      for (let x = 0; x < 32; x++) {
        const change = Math.abs(
          context.draft.groundLevelAt(x, z) - before[z * 32 + x]!,
        );
        expect(change).toBeLessThanOrEqual(1);
        if (change !== 0) expect(channels.has(columnKey({ x, z }))).toBe(true);
      }
  });

  it("declines water and fragmented growth instead of placing disconnected wall scatter", () => {
    const context = fixture();
    for (let z = 0; z < 32; z++)
      for (let x = 0; x < 32; x++)
        context.draft.setGroundSurface(x, z, SurfaceIds.WATER);
    expect(
      planCarapaceSites(context, context.draft.infestation!.zones).every(
        (zone) => zone.carapace === undefined,
      ),
    ).toBe(true);
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

  it("clips protected mission columns, rejoins surviving sections and rejects a fully protected formation", () => {
    const context = fixture();
    context.draft.infestation = {
      ...context.draft.infestation!,
      zones: planCarapaceSites(context, context.draft.infestation!.zones),
    };
    const site = context.draft.infestation.zones[0]!.carapace!;
    const protectedTile = site.cells.find(
      (cell) => cell.joins.length === 2,
    )!.tile;
    const protectedColumns = new Set([protectedTile.z * 32 + protectedTile.x]);
    expect(placeCarapaceSite(context, site, protectedColumns)).toBe(true);
    const actual = context.draft.infestation.zones[0]!.carapace!;
    expect(actual.realized).toBe(true);
    expect(
      actual.cells.some(
        (cell) => columnKey(cell.tile) === columnKey(protectedTile),
      ),
    ).toBe(false);
    expect(actual.cells.length).toBeLessThan(site.cells.length);
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

  it("varies stepped wall contours and chambers within equal-sized formations", () => {
    const outlines = Array.from({ length: 32 }, (_, seed) =>
      createCarapaceOutline(10, 10, new Mulberry32Rng(seed)),
    );
    const shapes = new Set(
      outlines.map((outline) => outline.walls.map(columnKey).sort().join("|")),
    );
    expect(shapes.size).toBeGreaterThan(16);
    for (const outline of outlines) {
      const walls = new Set(outline.walls.map(columnKey));
      expect(
        outline.walls.some(
          (tile) =>
            DIRECTIONS.filter((direction) =>
              walls.has(columnKey(stepColumn(tile, direction))),
            ).length === 3,
        ),
      ).toBe(true);
      expect(
        outline.walls.every(
          (tile) =>
            DIRECTIONS.filter((direction) =>
              walls.has(columnKey(stepColumn(tile, direction))),
            ).length <= 3,
        ),
      ).toBe(true);
    }
  });

  it.each([
    { seed: "infestation-review", infestation: 10 },
    { seed: "carapace-3", infestation: 6 },
    { seed: "carapace-0", infestation: 10 },
  ])(
    "assembles open terrain-following formations in $seed at level $infestation",
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
      const sites = map.infestation!.zones.flatMap((zone) =>
        zone.carapace?.realized === true ? [zone.carapace] : [],
      );
      expect(sites.length).toBeGreaterThan(0);
      expect(sites.length).toBeLessThanOrEqual(
        Math.ceil(map.infestation!.zones.length / 2),
      );
      for (const site of sites) expectAssembledSite(map, site);
      expect(generateTacticalMap(recipe)).toEqual(map);
      expect(
        new Set(sites.flatMap((site) => site.cells.map((cell) => cell.kind)))
          .size,
      ).toBeGreaterThanOrEqual(6);
      expect(
        map.props.some(
          (prop) =>
            prop.kind === "infested-hive" ||
            prop.kind === "infested-nest" ||
            prop.kind === "infested-brood",
        ),
      ).toBe(true);
    },
    20000,
  );
});

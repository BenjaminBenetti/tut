import { describe, expect, it } from "vitest";

import { BIOME_IDS, type BiomeId } from "../../content/model/biome-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import {
  HIVE_CAVERN_HOOKS,
  HIVE_CAVERN_SIZE,
  HIVE_CORE_MIN_DISTANCE,
} from "../data/hive-cavern-recipe";
import { HIVE_CAVERN_TUNING } from "../data/hive-cavern-tuning";
import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import type { CavernLayout } from "../model/cavern-layout";
import { HookKinds } from "../model/hook";
import type { MapDraft } from "../model/map-draft";
import type { MapGenParams } from "../model/map-recipe";
import { PassMask, type UnitClass } from "../model/pass-mask";
import type { TacticalMap } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import { createDefaultRegistries } from "./default-registries";
import { freezeDraft } from "./draft-freezer";
import { generateTacticalMap } from "./generate-tactical-map";
import { createHiveCavernPasses } from "./hive-cavern-pipeline";
import { validateTacticalMap } from "./map-validator";
import { validatePipeline } from "./pipeline-map-generator";
import { ReachabilityService } from "./reachability-service";
import { createPipeline } from "./settlement-pipeline";
import { TileIndex } from "./tile-index";

// ===========================================
// Sweep settings
// ===========================================

const registries = createDefaultRegistries();

/** Seeds per biome: the brief's floor of three, twelve biomes, 36 maps. */
const SEEDS_PER_BIOME = 3;

/**
 * Budget for one map, pipeline and freeze. Measured at 190–370 ms on an
 * idle box and 400–700 ms at a load average near 38; a CI runner is
 * about half this box's speed, so CI gets more room.
 */
const GENERATION_BUDGET_MS = process.env.CI === undefined ? 2_000 : 5_000;

/** Per-biome timeout: three maps and their checks on a loaded runner. */
const BIOME_TIMEOUT_MS = 120_000;

/** A brute stands on a 2×2 block and moves as infantry (#1130). */
const BRUTE_SIDE = 2;

/** Share of the board's depth in front of every edge spawn. */
const EDGE_SPAWN_BACK_SHARE = 1 / 3;

/** Rock rises at least this many layers above the floor beside it. */
const WALL_LAYERS = HIVE_CAVERN_TUNING.wallLayers;

// ===========================================
// Fixture
// ===========================================

/** One generated cavern: the frozen map, its draft and what it cost. */
interface Cavern {
  readonly seed: string;
  readonly map: TacticalMap;
  readonly draft: MapDraft;
  readonly layout: CavernLayout;
  readonly index: TileIndex;
  readonly reach: ReachabilityService;
  readonly ms: number;
}

/** The recipe parameters every hive cavern in the sweep uses. */
function paramsFor(biome: BiomeId): MapGenParams {
  return {
    archetype: "hive-cavern",
    biome,
    settlement: "rural",
    size: HIVE_CAVERN_SIZE,
    hooks: HIVE_CAVERN_HOOKS,
  };
}

/** Runs the hive-cavern pipeline for a seed and freezes the result, timed. */
function generate(biome: BiomeId, seed: string): Cavern {
  const params = paramsFor(biome);
  const started = performance.now();
  const result = createPipeline("hive-cavern", registries).run(
    params,
    new Mulberry32Rng(hashSeed(seed)),
  );
  const map = freezeDraft(result.draft, { seed, params }, registries);
  const ms = performance.now() - started;
  const layout = result.draft.cavern;
  if (layout === undefined) throw new Error(`${seed}: no cavern layout`);
  const index = new TileIndex(map);
  return {
    seed,
    map,
    draft: result.draft,
    layout,
    index,
    reach: new ReachabilityService(index, map.connectors),
    ms,
  };
}

// ===========================================
// Queries
// ===========================================

/** The frozen ground tile of a column. */
function groundTile(cavern: Cavern, x: number, z: number): Tile | undefined {
  if (x < 0 || z < 0 || x >= cavern.map.width || z >= cavern.map.depth) {
    return undefined;
  }
  return cavern.index.getAt(cavern.draft.groundCoord(x, z));
}

/** The chamber index of a column; -1 for tunnels and rock. */
function chamberIndexAt(cavern: Cavern, coord: TileCoord): number {
  return cavern.layout.chamberOf[coord.z * cavern.map.width + coord.x] ?? -1;
}

/** Tiles of every objective hook of `kind`. */
function objectivesOf(cavern: Cavern, kind: string) {
  return cavern.map.hooks.objectives.filter((hook) => hook.kind === kind);
}

/** True when a `side`-square block anchored at `anchor` is level ground a class may stand on. */
function blockFits(
  cavern: Cavern,
  anchor: Tile,
  side: number,
  unitClass: UnitClass,
): boolean {
  for (let dz = 0; dz < side; dz++) {
    for (let dx = 0; dx < side; dx++) {
      const tile = cavern.index.get(anchor.x + dx, anchor.y, anchor.z + dz);
      if (tile === undefined || !cavern.reach.canOccupy(tile, unitClass)) {
        return false;
      }
      const east = cavern.index.get(anchor.x + dx + 1, anchor.y, anchor.z + dz);
      if (
        dx + 1 < side &&
        !(east && cavern.reach.canStep(tile, east, unitClass))
      ) {
        return false;
      }
      const south = cavern.index.get(
        anchor.x + dx,
        anchor.y,
        anchor.z + dz + 1,
      );
      if (
        dz + 1 < side &&
        !(south && cavern.reach.canStep(tile, south, unitClass))
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Every anchor a 2×2 brute reaches from the deploy zone, under tactical's
 * footprint rule (#1130): each tile of the block steps the same way to
 * the anchor's new level, and the block fits where it lands.
 */
function bruteReach(cavern: Cavern): Set<number> {
  const unitClass = PassMask.INFANTRY;
  const seen = new Set<number>();
  const queue: Tile[] = [];
  for (const coord of cavern.map.hooks.deployZones.flatMap((h) => h.tiles)) {
    const tile = cavern.index.getAt(coord);
    if (tile === undefined || !blockFits(cavern, tile, BRUTE_SIDE, unitClass)) {
      continue;
    }
    const key = cavern.index.keyOf(tile);
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(tile);
  }
  for (const from of queue) {
    for (const to of cavern.reach.neighbours(from, unitClass)) {
      const key = cavern.index.keyOf(to);
      if (seen.has(key) || !bruteCanStep(cavern, from, to, unitClass)) continue;
      seen.add(key);
      queue.push(to);
    }
  }
  return seen;
}

/** Tactical's `footprintCanStep` for a 2×2 block, on the frozen map. */
function bruteCanStep(
  cavern: Cavern,
  from: Tile,
  to: Tile,
  unitClass: UnitClass,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  for (let oz = 0; oz < BRUTE_SIDE; oz++) {
    for (let ox = 0; ox < BRUTE_SIDE; ox++) {
      const here = cavern.index.get(from.x + ox, from.y, from.z + oz);
      const there = cavern.index.get(from.x + ox + dx, to.y, from.z + oz + dz);
      if (!here || !there || !cavern.reach.canStep(here, there, unitClass)) {
        return false;
      }
    }
  }
  return blockFits(cavern, to, BRUTE_SIDE, unitClass);
}

/** Columns a reachable brute block covers, as `z * width + x`. */
function bruteColumns(
  cavern: Cavern,
  anchors: ReadonlySet<number>,
): Set<number> {
  const columns = new Set<number>();
  for (const tile of cavern.map.tiles) {
    if (!anchors.has(cavern.index.keyOf(tile))) continue;
    for (let dz = 0; dz < BRUTE_SIDE; dz++) {
      for (let dx = 0; dx < BRUTE_SIDE; dx++) {
        columns.add((tile.z + dz) * cavern.map.width + tile.x + dx);
      }
    }
  }
  return columns;
}

/**
 * True when some `side`-square block of level, mech-standable ground
 * contains the column: the tunnel is at least `side` wide there.
 */
function levelBlockCovers(
  cavern: Cavern,
  x: number,
  z: number,
  side: number,
): boolean {
  for (let az = z - side + 1; az <= z; az++) {
    for (let ax = x - side + 1; ax <= x; ax++) {
      const anchor = groundTile(cavern, ax, az);
      if (anchor && blockFits(cavern, anchor, side, PassMask.MECH)) return true;
    }
  }
  return false;
}

/**
 * True when some `side`-square block of mech-standable ground, at any
 * levels, contains the column: side tunnels may climb between floors.
 */
function openBlockCovers(
  cavern: Cavern,
  x: number,
  z: number,
  side: number,
): boolean {
  for (let az = z - side + 1; az <= z; az++) {
    for (let ax = x - side + 1; ax <= x; ax++) {
      let every = true;
      for (let dz = 0; dz < side && every; dz++) {
        for (let dx = 0; dx < side && every; dx++) {
          const tile = groundTile(cavern, ax + dx, az + dz);
          every =
            tile !== undefined && cavern.reach.canOccupy(tile, PassMask.MECH);
        }
      }
      if (every) return true;
    }
  }
  return false;
}

// ===========================================
// Properties
// ===========================================

/**
 * Checks one generated cavern against the #1179 brief; the seed leads
 * every message so a failure names the map to reproduce.
 */
function expectCavernProperties(cavern: Cavern): void {
  const { seed, map, layout } = cavern;

  // Structurally valid, I1–I8.
  expect(validateTacticalMap(map, registries), seed).toEqual([]);

  // Five to eight chambers: a mouth, a core, route chambers and 1–3 sides.
  const roles = layout.chambers.map((chamber) => chamber.role);
  expect(roles.length, seed).toBeGreaterThanOrEqual(5);
  expect(roles.length, seed).toBeLessThanOrEqual(8);
  expect(
    roles.filter((role) => role === "mouth"),
    seed,
  ).toHaveLength(1);
  expect(
    roles.filter((role) => role === "core"),
    seed,
  ).toHaveLength(1);
  const sides = roles.filter((role) => role === "side").length;
  expect(sides, seed).toBeGreaterThanOrEqual(1);
  expect(sides, seed).toBeLessThanOrEqual(3);

  // Deploy and extraction at the mouth.
  const mouth = layout.chambers.findIndex((c) => c.role === "mouth");
  for (const tile of map.hooks.deployZones.flatMap((hook) => hook.tiles)) {
    expect(chamberIndexAt(cavern, tile), `${seed} deploy`).toBe(mouth);
  }
  for (const tile of map.hooks.extraction.tiles) {
    expect(chamberIndexAt(cavern, tile), `${seed} extraction`).toBe(mouth);
  }

  // Exactly one hive core: a level 3×3 in the core chamber, far from deploy.
  const cores = objectivesOf(cavern, HookKinds.HIVE_CORE);
  expect(cores, seed).toHaveLength(1);
  const core = cores[0]!;
  const coreIndex = layout.chambers.findIndex((c) => c.role === "core");
  expect(core.tiles, seed).toHaveLength(9);
  expect(new Set(core.tiles.map((tile) => tile.y)).size, seed).toBe(1);
  expect(core.meta, seed).toEqual({
    chamberId: `chamber-${String(coreIndex)}`,
    footprint: 3,
  });
  for (const tile of core.tiles) {
    expect(chamberIndexAt(cavern, tile), `${seed} core`).toBe(coreIndex);
  }
  const deploy = map.hooks.deployZones.flatMap((hook) => hook.tiles);
  const coreDistance = Math.min(
    ...core.tiles.flatMap((a) =>
      deploy.map((b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z)),
    ),
  );
  expect(coreDistance, seed).toBeGreaterThanOrEqual(HIVE_CORE_MIN_DISTANCE);
  const routeDepth = Math.max(
    ...layout.chambers.filter((c) => c.role !== "side").map((c) => c.depth),
  );
  expect(layout.chambers[coreIndex]?.depth, seed).toBe(routeDepth);

  // The core chamber is dressed as the hive: hive mounds round the pad.
  const hives = map.props.filter(
    (prop) =>
      prop.kind === PropKindIds.INFESTED_HIVE &&
      chamberIndexAt(cavern, prop.tile) === coreIndex,
  );
  expect(hives.length, `${seed} core hives`).toBeGreaterThanOrEqual(1);

  // One brood-chamber hook per chamber but the mouth, inside it.
  const broods = objectivesOf(cavern, HookKinds.BROOD_CHAMBER);
  expect(broods.map((hook) => hook.meta?.chamberId).sort(), seed).toEqual(
    layout.chambers
      .filter((chamber) => chamber.role !== "mouth")
      .map((chamber) => chamber.id)
      .sort(),
  );
  for (const brood of broods) {
    const chamber = layout.chambers.find((c) => c.id === brood.meta?.chamberId);
    expect(brood.meta, seed).toEqual({
      chamberId: chamber?.id,
      role: chamber?.role,
      radius: chamber?.radius,
      depth: chamber?.depth,
    });
    expect(chamberIndexAt(cavern, brood.tiles[0]!), seed).toBe(chamber?.index);
  }

  // Egg spawners in brood chambers: never the mouth, never a tunnel.
  const eggs = objectivesOf(cavern, HookKinds.EGG_SPAWNER);
  expect(eggs.length, seed).toBeGreaterThanOrEqual(2);
  expect(eggs.length, seed).toBeLessThanOrEqual(4);
  for (const egg of eggs) {
    const chamber = chamberIndexAt(cavern, egg.tiles[0]!);
    expect(chamber, `${seed} egg`).not.toBe(-1);
    expect(chamber, `${seed} egg`).not.toBe(mouth);
  }

  // Edge spawns where burrows meet the edge, deep in the hive and never
  // beside the drop ship.
  expect(map.hooks.edgeSpawns.length, seed).toBeGreaterThanOrEqual(1);
  for (const tile of map.hooks.edgeSpawns.flatMap((hook) => hook.tiles)) {
    expect(layout.open[tile.z * map.width + tile.x], seed).toBe(1);
    expect(tile.z, `${seed} edge spawn`).toBeGreaterThanOrEqual(
      map.depth * EDGE_SPAWN_BACK_SHARE,
    );
  }

  // A mech walks from the drop ship to the hive core.
  const mechReach = cavern.reach.reachableFrom(deploy, PassMask.MECH);
  expect(
    core.tiles.some((tile) => mechReach.has(cavern.index.keyOf(tile))),
    `${seed} mech to core`,
  ).toBe(true);

  // The main route and burrows: three wide and level at every centre-line
  // column past the mouth (where the drop ship stands), and every such
  // column under a brute that walked there from the drop ship.
  const brute = bruteColumns(cavern, bruteReach(cavern));
  for (const tunnel of layout.tunnels) {
    for (const column of tunnel.path) {
      if (chamberIndexAt(cavern, { ...column, y: 0 }) === mouth) continue;
      if (tunnel.kind === "side") {
        expect(
          openBlockCovers(cavern, column.x, column.z, 2),
          `${seed} ${tunnel.id} two wide at ${String(column.x)},${String(column.z)}`,
        ).toBe(true);
        continue;
      }
      expect(
        levelBlockCovers(cavern, column.x, column.z, 3),
        `${seed} ${tunnel.id} three wide at ${String(column.x)},${String(column.z)}`,
      ).toBe(true);
      expect(
        brute.has(column.z * map.width + column.x),
        `${seed} ${tunnel.id} brute at ${String(column.x)},${String(column.z)}`,
      ).toBe(true);
    }
  }
  for (const tile of core.tiles) {
    expect(brute.has(tile.z * map.width + tile.x), `${seed} brute core`).toBe(
      true,
    );
  }

  // Open-topped rock: bedrock nobody stands on, walls at least four
  // layers above the floor beside them.
  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      const i = z * map.width + x;
      const tile = groundTile(cavern, x, z);
      if (layout.open[i] === 1) continue;
      expect(tile?.surface, `${seed} rock ${String(x)},${String(z)}`).toBe(
        SurfaceIds.BEDROCK,
      );
      expect(tile?.pass, `${seed} rock ${String(x)},${String(z)}`).toBe(
        PassMask.NONE,
      );
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const floor = groundTile(cavern, x + dx, z + dz);
        if (floor === undefined) continue;
        if (layout.open[(z + dz) * map.width + x + dx] !== 1) continue;
        expect(
          (tile?.y ?? 0) - floor.y,
          `${seed} wall ${String(x)},${String(z)}`,
        ).toBeGreaterThanOrEqual(WALL_LAYERS);
      }
    }
  }
}

/** The middle value of a list of timings. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

// ===========================================
// Tests
// ===========================================

describe("hive cavern pipeline", () => {
  it("lists its passes in order with satisfied requirements", () => {
    const passes = createHiveCavernPasses();
    expect(passes.map((pass) => pass.id)).toEqual([
      "terrain",
      "cavern",
      "dropship-sites",
      "cavern-dressing",
      "slopes",
      "ramps",
      "hooks",
      "brood-chambers",
      "connectivity",
    ]);
    expect(() => {
      validatePipeline(passes);
    }).not.toThrow();
    expect(createPipeline("hive-cavern", registries).passIds).toEqual(
      passes.map((pass) => pass.id),
    );
  });

  it("generates the same valid map from the same recipe", () => {
    const recipe = { seed: "hive-determinism", params: paramsFor("temperate") };
    const first = generateTacticalMap(recipe, { registries });
    const second = generateTacticalMap(recipe, { registries });
    expect(second).toEqual(first);
    expect(first.width * first.depth).toBe(
      HIVE_CAVERN_SIZE.width * HIVE_CAVERN_SIZE.depth,
    );
  });

  it.each(BIOME_IDS)(
    "keeps every cavern property across seeds in %s",
    (biome) => {
      const timings: number[] = [];
      for (let s = 0; s < SEEDS_PER_BIOME; s++) {
        const cavern = generate(biome, `hive-${biome}-${String(s)}`);
        timings.push(cavern.ms);
        expectCavernProperties(cavern);
      }
      expect(
        median(timings),
        `${biome} generation ms: ${timings.map((ms) => ms.toFixed(0)).join(", ")}`,
      ).toBeLessThan(GENERATION_BUDGET_MS);
    },
    BIOME_TIMEOUT_MS,
  );
});

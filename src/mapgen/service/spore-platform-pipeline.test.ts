import { describe, expect, it } from "vitest";

import type { BiomeId } from "../../content/model/biome-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import {
  SPORE_PLATFORM_CORE_HOOKS,
  SPORE_PLATFORM_CORE_SIZE,
  SPORE_PLATFORM_HULL_HOOKS,
  SPORE_PLATFORM_HULL_SIZE,
} from "../data/spore-platform-recipe";
import { SPORE_PLATFORM_TUNING } from "../data/spore-platform-tuning";
import { SurfaceIds } from "../data/surfaces";
import { HookKinds, type Hook } from "../model/hook";
import type { MapDraft } from "../model/map-draft";
import type { MapArchetype, MapGenParams } from "../model/map-recipe";
import { PassMask, type UnitClass } from "../model/pass-mask";
import type { PlatformLayout } from "../model/platform-layout";
import type { TacticalMap } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import { createDefaultRegistries } from "./default-registries";
import { freezeDraft } from "./draft-freezer";
import { generateTacticalMap } from "./generate-tactical-map";
import { validateTacticalMap } from "./map-validator";
import { validatePipeline } from "./pipeline-map-generator";
import { ReachabilityService } from "./reachability-service";
import { createPipeline } from "./settlement-pipeline";
import {
  createSporePlatformCorePasses,
  createSporePlatformHullPasses,
} from "./spore-platform-pipeline";
import { TileIndex } from "./tile-index";

// ===========================================
// Sweep settings
// ===========================================

const registries = createDefaultRegistries();

/** Seeds per stage. */
const SEEDS = 12;

/**
 * The one biome the sweep runs in. The platform is in orbit: no pass of
 * either stage reads the biome (the deck is chitin, the edge is space),
 * so every biome yields the same map, which the biome test pins; a
 * sweep over all twelve would repeat the same maps twelve times.
 */
const BIOME: BiomeId = "temperate";

/**
 * Budget for one map, pipeline and freeze. Measured at 150–320 ms on an
 * idle box; a CI runner is about half this box's speed.
 */
const GENERATION_BUDGET_MS = process.env.CI === undefined ? 2_000 : 5_000;

/** Timeout for one stage's sweep. */
const SWEEP_TIMEOUT_MS = 120_000;

/** Main routes are at least this wide, level, for a mech and a brute. */
const ROUTE_SIDE = 2;

/** A brute stands on a 2×2 block and moves as infantry (#1130). */
const BRUTE_SIDE = 2;

/** Every surface a platform's deck may carry. */
const DECK_SURFACES: readonly string[] = [
  SurfaceIds.HULL_PLATE,
  SurfaceIds.HULL_PLATE_DARK,
  SurfaceIds.HULL_RIM,
  SurfaceIds.INFESTED,
];

// ===========================================
// Fixture
// ===========================================

/** One generated platform: the frozen map, its draft and what it cost. */
interface Platform {
  readonly seed: string;
  readonly map: TacticalMap;
  readonly draft: MapDraft;
  readonly layout: PlatformLayout;
  readonly index: TileIndex;
  readonly reach: ReachabilityService;
  readonly ms: number;
}

/** The recipe parameters a stage uses. */
function paramsFor(
  archetype: MapArchetype,
  biome: BiomeId = BIOME,
): MapGenParams {
  const hull = archetype === "spore-platform-hull";
  return {
    archetype,
    biome,
    settlement: "rural",
    size: hull ? SPORE_PLATFORM_HULL_SIZE : SPORE_PLATFORM_CORE_SIZE,
    hooks: hull ? SPORE_PLATFORM_HULL_HOOKS : SPORE_PLATFORM_CORE_HOOKS,
  };
}

/** Runs a stage's pipeline for a seed and freezes the result, timed. */
function generate(archetype: MapArchetype, seed: string): Platform {
  const params = paramsFor(archetype);
  const started = performance.now();
  const result = createPipeline(archetype, registries).run(
    params,
    new Mulberry32Rng(hashSeed(seed)),
  );
  const map = freezeDraft(result.draft, { seed, params }, registries);
  const ms = performance.now() - started;
  const layout = result.draft.platform;
  if (layout === undefined) throw new Error(`${seed}: no platform layout`);
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
function groundTile(p: Platform, x: number, z: number): Tile | undefined {
  if (x < 0 || z < 0 || x >= p.map.width || z >= p.map.depth) return undefined;
  return p.index.getAt(p.draft.groundCoord(x, z));
}

/** Every objective hook of a kind. */
function objectivesOf(p: Platform, kind: string): readonly Hook[] {
  return p.map.hooks.objectives.filter((hook) => hook.kind === kind);
}

/** Deploy tiles, flattened. */
function deployTiles(p: Platform): readonly TileCoord[] {
  return p.map.hooks.deployZones.flatMap((hook) => hook.tiles);
}

/** Least Manhattan distance between two tile sets. */
function gap(a: readonly TileCoord[], b: readonly TileCoord[]): number {
  return Math.min(
    ...a.flatMap((s) =>
      b.map((t) => Math.abs(s.x - t.x) + Math.abs(s.z - t.z)),
    ),
  );
}

/** True when `side`-square block anchored at `anchor` is level ground the class may stand on. */
function blockFits(
  p: Platform,
  anchor: Tile,
  side: number,
  unitClass: UnitClass,
): boolean {
  for (let dz = 0; dz < side; dz++) {
    for (let dx = 0; dx < side; dx++) {
      const tile = p.index.get(anchor.x + dx, anchor.y, anchor.z + dz);
      if (tile === undefined || !p.reach.canOccupy(tile, unitClass)) {
        return false;
      }
    }
  }
  return true;
}

/** True when some level, mech-standable `side` square contains the column. */
function levelBlockCovers(
  p: Platform,
  x: number,
  z: number,
  side: number,
): boolean {
  for (let az = z - side + 1; az <= z; az++) {
    for (let ax = x - side + 1; ax <= x; ax++) {
      const anchor = groundTile(p, ax, az);
      if (anchor && blockFits(p, anchor, side, PassMask.MECH)) return true;
    }
  }
  return false;
}

/**
 * Every anchor a 2×2 brute reaches from the deploy zone, under tactical's
 * footprint rule (#1130): each tile of the block steps to the anchor's
 * new level, and the block fits where it lands.
 */
function bruteReach(p: Platform): Set<number> {
  const unitClass = PassMask.INFANTRY;
  const seen = new Set<number>();
  const queue: Tile[] = [];
  for (const coord of deployTiles(p)) {
    const tile = p.index.getAt(coord);
    if (tile === undefined || !blockFits(p, tile, BRUTE_SIDE, unitClass)) {
      continue;
    }
    if (seen.has(p.index.keyOf(tile))) continue;
    seen.add(p.index.keyOf(tile));
    queue.push(tile);
  }
  for (const from of queue) {
    for (const to of p.reach.neighbours(from, unitClass)) {
      const key = p.index.keyOf(to);
      if (seen.has(key) || !bruteCanStep(p, from, to, unitClass)) continue;
      seen.add(key);
      queue.push(to);
    }
  }
  return seen;
}

/** Tactical's `footprintCanStep` for a 2×2 block, on the frozen map. */
function bruteCanStep(
  p: Platform,
  from: Tile,
  to: Tile,
  unitClass: UnitClass,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  for (let oz = 0; oz < BRUTE_SIDE; oz++) {
    for (let ox = 0; ox < BRUTE_SIDE; ox++) {
      const here = p.index.get(from.x + ox, from.y, from.z + oz);
      const there = p.index.get(from.x + ox + dx, to.y, from.z + oz + dz);
      if (!here || !there || !p.reach.canStep(here, there, unitClass)) {
        return false;
      }
    }
  }
  return blockFits(p, to, BRUTE_SIDE, unitClass);
}

/** Columns a reachable brute block covers, as `z * width + x`. */
function bruteColumns(p: Platform, anchors: ReadonlySet<number>): Set<number> {
  const columns = new Set<number>();
  for (const tile of p.map.tiles) {
    if (!anchors.has(p.index.keyOf(tile))) continue;
    for (let dz = 0; dz < BRUTE_SIDE; dz++) {
      for (let dx = 0; dx < BRUTE_SIDE; dx++) {
        columns.add((tile.z + dz) * p.map.width + tile.x + dx);
      }
    }
  }
  return columns;
}

/**
 * Columns walkable from deploy by `unitClass` when the `cut` columns are
 * taken away, as `z * width + x`.
 */
function reachWithout(
  p: Platform,
  cut: ReadonlySet<number>,
  unitClass: UnitClass,
): Set<number> {
  const column = (tile: TileCoord) => tile.z * p.map.width + tile.x;
  const seen = new Set<number>();
  const queue: Tile[] = [];
  for (const coord of deployTiles(p)) {
    const tile = p.index.getAt(coord);
    if (tile === undefined || cut.has(column(tile))) continue;
    if (seen.has(p.index.keyOf(tile))) continue;
    seen.add(p.index.keyOf(tile));
    queue.push(tile);
  }
  for (const from of queue) {
    for (const to of p.reach.neighbours(from, unitClass)) {
      const key = p.index.keyOf(to);
      if (seen.has(key) || cut.has(column(to))) continue;
      seen.add(key);
      queue.push(to);
    }
  }
  return new Set(
    p.map.tiles
      .filter((tile) => seen.has(p.index.keyOf(tile)))
      .map((tile) => column(tile)),
  );
}

/**
 * True on an edge: a deck column with void or lower deck among its eight
 * in-bounds neighbours, the platform's rim or a terrace's lip.
 */
function onEdge(p: Platform, x: number, z: number): boolean {
  const level = p.draft.groundLevelAt(x, z);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!p.draft.inBounds(x + dx, z + dz)) continue;
      if (p.layout.deck[(z + dz) * p.map.width + x + dx] !== 1) return true;
      if (p.draft.groundLevelAt(x + dx, z + dz) < level) return true;
    }
  }
  return false;
}

// ===========================================
// Properties
// ===========================================

/** Checks what both stages share: validity, space, palette, routes, reach. */
function expectPlatformProperties(p: Platform): void {
  const { seed, map, layout } = p;

  // Structurally valid, I1–I8, with every hook the recipe asks for.
  expect(validateTacticalMap(map, registries), seed).toEqual([]);

  // Space past the deck: void nobody stands on. The deck: chitin plates,
  // with tan only on the rim and the terraces' lips.
  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      const tile = groundTile(p, x, z);
      const at = `${seed} ${String(x)},${String(z)}`;
      if (layout.deck[z * map.width + x] !== 1) {
        expect(tile?.surface, at).toBe(SurfaceIds.VOID);
        expect(tile?.pass, at).toBe(PassMask.NONE);
        continue;
      }
      expect(DECK_SURFACES, at).toContain(tile?.surface);
      if (tile?.surface === SurfaceIds.HULL_RIM) {
        expect(onEdge(p, x, z), `${at} rim`).toBe(true);
      }
    }
  }

  // Every main route at least two wide, level across, and walked end to
  // end by a mech and a 2×2 brute from the deploy zone. The drop ship's
  // hull stands on the hull's spine where it docks.
  const brute = bruteColumns(p, bruteReach(p));
  for (const route of layout.routes) {
    expect(route.minWidth, `${seed} ${route.id}`).toBeGreaterThanOrEqual(
      ROUTE_SIDE,
    );
    for (const { x, z } of route.path) {
      if (p.draft.isDropshipHull(x, z)) continue;
      const at = `${seed} ${route.id} at ${String(x)},${String(z)}`;
      expect(levelBlockCovers(p, x, z, ROUTE_SIDE), `${at} two wide`).toBe(
        true,
      );
      expect(brute.has(z * map.width + x), `${at} brute`).toBe(true);
    }
  }

  // Every pad hook is a level square a mech reaches, the size planned.
  const mechReach = p.reach.reachableFrom(deployTiles(p), PassMask.MECH);
  for (const pad of layout.pads) {
    const hooks = [...map.hooks.objectives, ...map.hooks.deployZones].filter(
      (hook) => hook.kind === pad.kind,
    );
    const hook = hooks.find(
      (h) => h.tiles[0]?.x === pad.x && h.tiles[0]?.z === pad.z,
    );
    expect(hook, `${seed} ${pad.kind} on its pad`).toBeDefined();
    expect(hook?.tiles, `${seed} ${pad.kind}`).toHaveLength(
      pad.size * pad.size,
    );
    expect(
      new Set(hook?.tiles.map((t) => t.y)).size,
      `${seed} ${pad.kind}`,
    ).toBe(1);
    expect(hook?.meta?.footprint, `${seed} ${pad.kind}`).toBe(pad.size);
    expect(
      hook?.tiles.some((t) => mechReach.has(p.index.keyOf(t))),
      `${seed} mech to ${pad.kind}`,
    ).toBe(true);
  }

  // Egg spawners stand in the pods' beds or niches.
  for (const egg of objectivesOf(p, HookKinds.EGG_SPAWNER)) {
    const tile = egg.tiles[0]!;
    expect(layout.podBeds[tile.z * map.width + tile.x], `${seed} egg`).toBe(1);
  }

  // Extraction is where the drop ship put the squad down.
  expect(map.hooks.extraction.tiles, seed).toEqual(deployTiles(p));
}

/** Checks the hull: the docking ring, the hatch, the pods and the far edge. */
function expectHullProperties(p: Platform): void {
  const { seed, map } = p;
  expectPlatformProperties(p);
  expect(p.layout.stage, seed).toBe("hull");
  const count = (kind: string) => objectivesOf(p, kind).length;
  expect(
    map.hooks.deployZones.map((h) => h.kind),
    seed,
  ).toEqual([HookKinds.DEPLOY]);
  expect(count(HookKinds.DOCKING_RING), seed).toBe(1);
  expect(count(HookKinds.PLATFORM_EXIT), seed).toBe(1);
  expect(count(HookKinds.EGG_SPAWNER), seed).toBe(3);
  expect(map.hooks.edgeSpawns, seed).toHaveLength(2);

  // The drop ship docks at the prow.
  expect(map.dropships, seed).toHaveLength(1);
  expect(p.draft.requiresDropships, seed).toBe(true);

  // The ring sits on a flank, meta says which, and the hatch is deepest.
  const ring = objectivesOf(p, HookKinds.DOCKING_RING)[0]!;
  expect(["east", "west"], seed).toContain(ring.meta?.side);
  const exit = objectivesOf(p, HookKinds.PLATFORM_EXIT)[0]!;
  expect(gap(exit.tiles, deployTiles(p)), seed).toBeGreaterThan(
    gap(ring.tiles, deployTiles(p)),
  );

  // Bugs board where the hull runs off the map, behind the hatch.
  for (const tile of map.hooks.edgeSpawns.flatMap((h) => h.tiles)) {
    expect(tile.z, `${seed} edge spawn`).toBe(map.depth - 1);
  }
}

/** Checks the core: the chamber, its one causeway, the dais and the guards. */
function expectCoreProperties(p: Platform): void {
  const { seed, map, layout } = p;
  const core = SPORE_PLATFORM_TUNING.core;
  expectPlatformProperties(p);
  expect(layout.stage, seed).toBe("core");
  const count = (kind: string) => objectivesOf(p, kind).length;
  expect(count(HookKinds.PLATFORM_CORE), seed).toBe(1);
  expect(count(HookKinds.SOVEREIGN_DAIS), seed).toBe(1);
  expect(count(HookKinds.GUARD_POST), seed).toBe(4);
  expect(count(HookKinds.EGG_SPAWNER), seed).toBe(4);
  expect(map.hooks.edgeSpawns, seed).toHaveLength(2);

  // The dais takes the Sovereign's 4×4 kit, between the seed and the
  // causeway and flush with the arena, so the Sovereign can fall back to
  // the core; guard posts flank it, two a side.
  const dais = objectivesOf(p, HookKinds.SOVEREIGN_DAIS)[0]!;
  const seedPad = objectivesOf(p, HookKinds.PLATFORM_CORE)[0]!;
  expect(dais.tiles, seed).toHaveLength(16);
  expect(seedPad.tiles, seed).toHaveLength(core.corePadSize ** 2);
  expect(dais.tiles[0]!.y, seed).toBe(seedPad.tiles[0]!.y);
  expect(gap(dais.tiles, deployTiles(p)), seed).toBeLessThan(
    gap(seedPad.tiles, deployTiles(p)),
  );
  const guards = objectivesOf(p, HookKinds.GUARD_POST);
  expect(guards.map((g) => g.meta?.side).sort(), seed).toEqual([
    "east",
    "east",
    "west",
    "west",
  ]);
  for (const guard of guards) {
    expect(gap(guard.tiles, dais.tiles), `${seed} guard`).toBeLessThanOrEqual(
      4,
    );
  }

  // Deploy on the pad before the causeway.
  for (const tile of deployTiles(p)) {
    expect(tile.z, `${seed} deploy`).toBeLessThan(core.startPadDepth);
  }

  // Bugs come in by the ducts, at the side edges.
  for (const tile of map.hooks.edgeSpawns.flatMap((h) => h.tiles)) {
    expect([0, map.width - 1], `${seed} edge spawn`).toContain(tile.x);
  }

  // The causeway is narrow and the ONLY way in: every row between the
  // start pad and the chamber holds the causeway alone, and with its
  // band cut away nothing in the chamber is reachable from deploy.
  const chamber = layout.chamber!;
  let front = map.depth;
  for (let i = 0; i < chamber.length; i++) {
    if (chamber[i] === 1) front = Math.min(front, Math.floor(i / map.width));
  }
  const causeway = layout.routes.find((r) => r.kind === "causeway")!;
  const cut = new Set<number>();
  for (let z = core.startPadDepth; z < front; z++) {
    const deck: number[] = [];
    for (let x = 0; x < map.width; x++) {
      if (layout.deck[z * map.width + x] === 1) deck.push(x);
    }
    expect(deck, `${seed} causeway row ${String(z)}`).toHaveLength(
      core.causewayWidth,
    );
    const centre = causeway.path.find((c) => c.z === z)!.x;
    const half = Math.floor(core.causewayWidth / 2);
    for (let x = centre - half; x <= centre + half; x++) {
      cut.add(z * map.width + x);
    }
  }
  expect(cut.size, seed).toBeGreaterThan(0);
  for (const unitClass of [PassMask.INFANTRY, PassMask.MECH]) {
    const open = reachWithout(p, new Set(), unitClass);
    const shut = reachWithout(p, cut, unitClass);
    const inside = (reached: Set<number>) =>
      [...reached].filter((i) => chamber[i] === 1).length;
    expect(
      inside(open),
      `${seed} class ${String(unitClass)} in`,
    ).toBeGreaterThan(0);
    expect(inside(shut), `${seed} class ${String(unitClass)} cut`).toBe(0);
  }
}

/** The middle value of a list of timings. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Everything a map shows but the recipe it was made from. */
function content(map: TacticalMap) {
  const { recipe: _recipe, ...rest } = map;
  return rest;
}

// ===========================================
// Tests
// ===========================================

describe("spore platform pipelines", () => {
  it("lists the hull's passes in order with satisfied requirements", () => {
    const passes = createSporePlatformHullPasses();
    expect(passes.map((pass) => pass.id)).toEqual([
      "hull-deck",
      "dropship-sites",
      "platform-dressing",
      "ramps",
      "hooks",
      "connectivity",
    ]);
    expect(() => {
      validatePipeline(passes);
    }).not.toThrow();
    expect(createPipeline("spore-platform-hull", registries).passIds).toEqual(
      passes.map((pass) => pass.id),
    );
  });

  it("lists the core's passes in order with satisfied requirements", () => {
    const passes = createSporePlatformCorePasses();
    expect(passes.map((pass) => pass.id)).toEqual([
      "core-chamber",
      "platform-dressing",
      "ramps",
      "hooks",
      "connectivity",
    ]);
    expect(() => {
      validatePipeline(passes);
    }).not.toThrow();
    expect(createPipeline("spore-platform-core", registries).passIds).toEqual(
      passes.map((pass) => pass.id),
    );
  });

  it.each(["spore-platform-hull", "spore-platform-core"] as const)(
    "generates the same valid %s from the same recipe, whatever the biome",
    (archetype) => {
      const recipe = {
        seed: `${archetype}-determinism`,
        params: paramsFor(archetype),
      };
      const first = generateTacticalMap(recipe, { registries });
      const second = generateTacticalMap(recipe, { registries });
      expect(second).toEqual(first);
      const snowy = generateTacticalMap(
        { ...recipe, params: paramsFor(archetype, "snowy") },
        { registries },
      );
      expect(content(snowy)).toEqual(content(first));
    },
  );

  it(
    "keeps every hull property across seeds",
    () => {
      const timings: number[] = [];
      for (let s = 0; s < SEEDS; s++) {
        const platform = generate("spore-platform-hull", `hull-${String(s)}`);
        timings.push(platform.ms);
        expectHullProperties(platform);
      }
      expect(median(timings), timings.join(", ")).toBeLessThan(
        GENERATION_BUDGET_MS,
      );
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    "keeps every core property across seeds",
    () => {
      const timings: number[] = [];
      for (let s = 0; s < SEEDS; s++) {
        const platform = generate("spore-platform-core", `core-${String(s)}`);
        timings.push(platform.ms);
        expectCoreProperties(platform);
      }
      expect(median(timings), timings.join(", ")).toBeLessThan(
        GENERATION_BUDGET_MS,
      );
    },
    SWEEP_TIMEOUT_MS,
  );
});

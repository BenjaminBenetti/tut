import { describe, expect, it } from "vitest";

import { BIOME_IDS, type BiomeId } from "../../content/model/biome-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { GREAT_POD_MISSION_HOOKS } from "../data/great-pod-recipe";
import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import { GREAT_POD_SITE_ID } from "../generator/great-pod/great-pod-site-pass";
import type { GreatPodLayout } from "../model/great-pod-layout";
import { HookKinds } from "../model/hook";
import type { MapDraft } from "../model/map-draft";
import type { MapGenParams } from "../model/map-recipe";
import { PassMask, type UnitClass } from "../model/pass-mask";
import type { ColumnCoord } from "../model/road";
import type { TacticalMap } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import { createDefaultRegistries } from "./default-registries";
import { freezeDraft } from "./draft-freezer";
import { createGreatPodPasses } from "./great-pod-pipeline";
import { validateTacticalMap } from "./map-validator";
import { validatePipeline } from "./pipeline-map-generator";
import { ReachabilityService } from "./reachability-service";
import { createPipeline } from "./settlement-pipeline";
import { TileIndex } from "./tile-index";

// ===========================================
// Sweep settings
// ===========================================

const registries = createDefaultRegistries();

/** Seeds per biome: twelve biomes, 36 maps. */
const SEEDS_PER_BIOME = 3;

/** Per-biome timeout: three maps, each frozen twice, on a loaded runner. */
const BIOME_TIMEOUT_MS = 120_000;

/** The hull's three kinds. */
const HULL_KINDS: readonly string[] = [
  PropKindIds.GREAT_POD_HULL_PLATE,
  PropKindIds.GREAT_POD_HULL_CURVE,
  PropKindIds.GREAT_POD_HULL_SEAM,
];

// ===========================================
// Fixture
// ===========================================

/** One generated pod: the frozen map, its draft and its plan. */
interface Pod {
  readonly seed: string;
  readonly params: MapGenParams;
  readonly map: TacticalMap;
  readonly draft: MapDraft;
  readonly layout: GreatPodLayout;
  readonly index: TileIndex;
}

/** First Skyfall's recipe parameters in `biome`. */
function paramsFor(biome: BiomeId): MapGenParams {
  return {
    archetype: "great-pod",
    biome,
    settlement: "rural",
    size: "small",
    hooks: GREAT_POD_MISSION_HOOKS,
    infestation: 1,
  };
}

/** Runs the great-pod pipeline for a seed and freezes the result. */
function generate(biome: BiomeId, seed: string): Pod {
  const params = paramsFor(biome);
  const result = createPipeline("great-pod", registries).run(
    params,
    new Mulberry32Rng(hashSeed(seed)),
  );
  const map = freezeDraft(result.draft, { seed, params }, registries);
  const layout = result.draft.greatPod;
  if (layout === undefined) throw new Error(`${seed}: no great pod`);
  return {
    seed,
    params,
    map,
    draft: result.draft,
    layout,
    index: new TileIndex(map),
  };
}

// ===========================================
// Queries
// ===========================================

/** A column's key. */
function key(column: ColumnCoord): string {
  return `${String(column.x)}:${String(column.z)}`;
}

/** The frozen ground tile of a column. */
function groundTile(
  index: TileIndex,
  draft: MapDraft,
  column: ColumnCoord,
): Tile | undefined {
  return index.getAt(draft.groundCoord(column.x, column.z));
}

/** The kind of the prop on a frozen tile, if any. */
function kindOn(map: TacticalMap, tile: Tile | undefined): string | undefined {
  if (tile?.propId === undefined) return undefined;
  return map.props.find((prop) => prop.id === tile.propId)?.kind;
}

/** Columns `unitClass` walks to from the deploy zone, by key. */
function reachFromDeploy(
  map: TacticalMap,
  index: TileIndex,
  unitClass: UnitClass,
): Set<string> {
  const reach = new ReachabilityService(index, map.connectors);
  const seen = new Set<number>();
  const queue: Tile[] = [];
  for (const coord of map.hooks.deployZones.flatMap((hook) => hook.tiles)) {
    const tile = index.getAt(coord);
    if (tile === undefined || seen.has(index.keyOf(tile))) continue;
    seen.add(index.keyOf(tile));
    queue.push(tile);
  }
  for (const from of queue) {
    for (const to of reach.neighbours(from, unitClass)) {
      if (seen.has(index.keyOf(to))) continue;
      seen.add(index.keyOf(to));
      queue.push(to);
    }
  }
  return new Set(
    map.tiles.filter((tile) => seen.has(index.keyOf(tile))).map(key),
  );
}

/**
 * The pod after a breach at both seams, as the generator could have
 * made it: the seam props taken off the draft and the draft frozen again.
 */
function breached(pod: Pod): { map: TacticalMap; index: TileIndex } {
  const seams = new Set(pod.layout.seams.map(key));
  for (const prop of [...pod.draft.props]) {
    if (seams.has(key(prop.tile))) pod.draft.removeProp(prop.id);
  }
  const map = freezeDraft(
    pod.draft,
    { seed: pod.seed, params: pod.params },
    registries,
  );
  return { map, index: new TileIndex(map) };
}

// ===========================================
// Properties
// ===========================================

/** Every property one generated pod must have. */
function expectPodProperties(pod: Pod): void {
  const { seed, map, draft, layout, index } = pod;
  const at = (column: ColumnCoord): string => `${seed} ${key(column)}`;
  const tileOf = (column: ColumnCoord): Tile | undefined =>
    groundTile(index, draft, column);

  // Structurally valid, I1–I8, with every hook the recipe asks for.
  expect(validateTacticalMap(map, registries), seed).toEqual([]);

  // The hull: a hull piece on every ring column, a seam on the axis.
  const seams = new Set(layout.seams.map(key));
  for (const column of [...layout.hull, ...layout.seams]) {
    const kind = kindOn(map, tileOf(column));
    expect(HULL_KINDS, at(column)).toContain(kind);
    expect(kind === PropKindIds.GREAT_POD_HULL_SEAM, at(column)).toBe(
      seams.has(key(column)),
    );
    expect(tileOf(column)?.pass, at(column)).toBe(PassMask.NONE);
    expect(tileOf(column)?.blocksLos, at(column)).toBe(true);
    expect(draft.isLandingReserved(column.x, column.z), at(column)).toBe(false);
  }

  // The membrane and ribs: carapace that blocks sight and movement.
  for (const column of [...layout.membrane, ...layout.ribs]) {
    expect(kindOn(map, tileOf(column)) ?? "", at(column)).toMatch(
      /^infested-carapace-(wall|spine)/,
    );
    expect(tileOf(column)?.blocksLos, at(column)).toBe(true);
    expect(tileOf(column)?.pass, at(column)).toBe(PassMask.NONE);
  }

  // The floor: bare plate every unit class may stand on.
  for (const column of layout.floor) {
    const tile = tileOf(column);
    expect(tile?.propId, at(column)).toBeUndefined();
    expect(
      [SurfaceIds.HULL_PLATE, SurfaceIds.HULL_PLATE_DARK],
      at(column),
    ).toContain(tile?.surface);
    expect(tile?.pass, at(column)).toBe(PassMask.ALL);
    expect(tile?.y, at(column)).toBe(layout.level);
  }

  // The site names every wall, so connectivity repair never cuts the pod.
  const site = draft.sites.find(
    (candidate) => candidate.id === GREAT_POD_SITE_ID,
  );
  const walls = map.props.filter(
    (prop) =>
      HULL_KINDS.includes(prop.kind) ||
      prop.kind.startsWith("infested-carapace-"),
  );
  expect(new Set(site?.structureIds), seed).toEqual(
    new Set(walls.map((prop) => prop.id)),
  );

  // The core: one 3×3 hook on the plan's square, sealed in; a brood hook
  // per chamber, the core's on the core.
  const cores = map.hooks.objectives.filter(
    (hook) => hook.kind === HookKinds.GREAT_POD_CORE,
  );
  expect(cores, seed).toHaveLength(1);
  expect(cores[0]?.tiles[0], seed).toEqual(
    draft.groundCoord(layout.core.x, layout.core.z),
  );
  expect(cores[0]?.tiles, seed).toHaveLength(layout.core.size ** 2);
  expect(cores[0]?.requiredPass, seed).toBe(PassMask.NONE);
  const broods = map.hooks.objectives.filter(
    (hook) => hook.kind === HookKinds.BROOD_CHAMBER,
  );
  expect(broods.map((hook) => hook.meta?.chamberId).sort(), seed).toEqual(
    layout.chambers.map((room) => room.id).sort(),
  );

  // Sealed: nothing walks in from the drop zone, on foot or in a mech.
  for (const unitClass of [PassMask.INFANTRY, PassMask.MECH]) {
    const reached = reachFromDeploy(map, index, unitClass);
    expect(
      layout.floor.filter((column) => reached.has(key(column))).map(key),
      `${seed} class ${String(unitClass)}`,
    ).toEqual([]);
    // And the hull is reachable from outside: some seam has open ground
    // the squad can stand on beside it.
    const besideSeam = layout.verge.filter((column) =>
      layout.seams.some(
        (seam) =>
          Math.abs(seam.x - column.x) + Math.abs(seam.z - column.z) === 1,
      ),
    );
    expect(
      besideSeam.some((column) => reached.has(key(column))),
      `${seed} seam reachable, class ${String(unitClass)}`,
    ).toBe(true);
  }

  // Breached at the seams, a mech walks from the drop zone to the core.
  const after = breached(pod);
  const reached = reachFromDeploy(after.map, after.index, PassMask.MECH);
  const beside = layout.floor.filter(
    (column) =>
      column.x >= layout.core.x - 1 &&
      column.x <= layout.core.x + layout.core.size &&
      column.z >= layout.core.z - 1 &&
      column.z <= layout.core.z + layout.core.size &&
      !(
        column.x >= layout.core.x &&
        column.x < layout.core.x + layout.core.size &&
        column.z >= layout.core.z &&
        column.z < layout.core.z + layout.core.size
      ),
  );
  expect(
    beside.some((column) => reached.has(key(column))),
    `${seed} core reachable after a breach`,
  ).toBe(true);
}

// ===========================================
// Tests
// ===========================================

describe("great-pod pipeline", () => {
  it("is a valid pipeline: every pass has what it requires", () => {
    expect(() => validatePipeline(createGreatPodPasses())).not.toThrow();
  });

  for (const biome of BIOME_IDS) {
    it(
      `builds a sealed, breachable pod in ${biome}`,
      () => {
        for (let n = 0; n < SEEDS_PER_BIOME; n++) {
          expectPodProperties(
            generate(biome, `great-pod-${biome}-${String(n)}`),
          );
        }
      },
      BIOME_TIMEOUT_MS,
    );
  }

  it("lays the same pod for the same seed", () => {
    const a = generate("temperate", "great-pod-again");
    const b = generate("temperate", "great-pod-again");
    expect(a.map).toEqual(b.map);
  });
});

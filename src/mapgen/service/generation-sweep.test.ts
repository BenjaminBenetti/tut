import { describe, expect, it } from "vitest";

import type { BiomeId } from "../../content/model/biome-id";
import { BIOME_IDS } from "../../content/model/biome-id";
import type { SettlementScale } from "../../content/model/settlement-scale";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { SETTLEMENT_DEFINITIONS } from "../data/settlements";
import type { GenerationPass } from "../model/generation-pass";
import type { MapRecipe, MapSizePreset } from "../model/map-recipe";
import { MAP_SIZE_PRESETS } from "../model/map-recipe";
import { areaFactor } from "../generator/lot-pass";
import { hatchSpace } from "../generator/placer/placer-support";
import { HATCH_SPACE_MIN } from "../generator/placer/egg-spawner-placer";
import { PassMask } from "../model/pass-mask";
import { renderAscii } from "./ascii-map-renderer";
import { createDefaultRegistries } from "./default-registries";
import { freezeDraft } from "./draft-freezer";
import {
  generateTacticalMap,
  generateTacticalMapWithDiagnostics,
} from "./generate-tactical-map";
import { PipelineMapGenerator } from "./pipeline-map-generator";
import { ReachabilityService } from "./reachability-service";
import { createSettlementPasses } from "./settlement-pipeline";
import { DIRECTIONS, type Direction } from "../../core/model/direction";
import { oppositeDirection, stepGridPos } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import type { Tile } from "../model/tile";
import { TileIndex } from "./tile-index";

const registries = createDefaultRegistries();

/** Biome × settlement × size combinations the sweep walks. */
const COMBOS = 4 * 3 * 3;

/**
 * Seeds per combination: six locally, three on CI (#829). At the ADR 0009
 * scale the 216-map matrix takes ~55 s here and did not finish inside
 * 120 s on the runner, which is four to five times slower; the tripwire
 * below scales with this so the cut is on the record, and the full
 * matrix still runs on every local `pnpm test` and twenty deep under
 * `MAPGEN_WIDE=1`.
 */
const SEEDS_PER_COMBO = process.env.CI === undefined ? 6 : 3;

/**
 * The sweep is the most expensive thing in the suite: 216 maps, 12–16 s
 * on an idle box across repeated runs, and a CI runner is about half
 * that speed. Thirty seconds was written when the sweep was smaller and
 * stopped being enough — it timed out on CI (#671) with no cost
 * regression behind it, measured at 12 s on the branch against 12 s on
 * `main`. At the ADR 0009 scale (#829: ×2.25 area, wide roads, bigger
 * interiors) the same 216 maps take ~55 s on a loaded box and the runner
 * did not finish them in 120 s, so CI sweeps three seeds per combination
 * (108 maps, ~30 s here) inside a 240 s budget.
 *
 * The budget moves rather than the coverage: `generations` is asserted
 * at the whole matrix (`COMBOS * SEEDS_PER_COMBO`) precisely so nobody
 * buys time by quietly sweeping fewer maps, and that guard is right.
 * What catches a generator that has become slower is the wide sweep's
 * runtime, not this number.
 */
const SWEEP_TIMEOUT_MS = 240_000;

function recipe(
  seed: string,
  biome: BiomeId,
  settlement: SettlementScale,
  size: MapSizePreset,
): MapRecipe {
  return {
    seed,
    params: {
      archetype: "settlement",
      biome,
      settlement,
      size,
      hooks: DEFAULT_MISSION_HOOKS,
    },
  };
}

/**
 * Golden seeds: the checksum of the ASCII renders of every half-height layer is pinned so an
 * unintended change in generator output fails loudly. To update after a
 * deliberate change, run this file, copy the "actual" checksums from the
 * failure into `checksum` below, and say so in the PR.
 */
interface Golden {
  readonly seed: string;
  readonly biome: BiomeId;
  readonly settlement: SettlementScale;
  readonly size: MapSizePreset;
  readonly checksum: number;
}

const GOLDENS: readonly Golden[] = [
  {
    seed: "golden-temperate",
    biome: "temperate",
    settlement: "town",
    size: "medium",
    checksum: 234061464,
  },
  {
    seed: "golden-snowy",
    biome: "snowy",
    settlement: "town",
    size: "medium",
    checksum: 4132806389,
  },
  {
    seed: "golden-desert",
    biome: "desert",
    settlement: "town",
    size: "medium",
    checksum: 972340691,
  },
  {
    seed: "golden-coastal",
    biome: "coastal",
    settlement: "town",
    size: "medium",
    checksum: 406540221,
  },
  {
    seed: "golden-rural",
    biome: "temperate",
    settlement: "rural",
    size: "small",
    checksum: 743992674,
  },
  {
    seed: "golden-city",
    biome: "desert",
    settlement: "city",
    size: "large",
    checksum: 4220186506,
  },
];

describe("generation sweep", () => {
  it(
    "generates a valid, playable map for every biome, settlement and size across seeds",
    () => {
      let generations = 0;
      let buildings = 0;
      let interiorProps = 0;
      let crampedSpawners = 0;
      const tallMaps: Record<string, { maps: number; tall: number }> = {
        town: { maps: 0, tall: 0 },
        city: { maps: 0, tall: 0 },
      };
      let unreachableEntrances = 0;
      let hooks = 0;
      let relocations = 0;
      let roadStepsWithoutConnector = 0;
      let slopeTiles = 0;
      let slopeStepsNotWalkable = 0;
      let connectorsFromSlopes = 0;
      let naturalStepsOverOne = 0;
      let concaveLeftStraight = 0;
      let slopesWithWalls = 0;
      let orphanCorners = 0;
      let slopeRunsUnder100 = 0;
      let bareSteps = 0;
      let barePavedEdges = 0;
      for (const size of MAP_SIZE_PRESETS) {
        for (const biome of BIOME_IDS) {
          for (const settlement of SETTLEMENT_SCALES) {
            for (let i = 0; i < SEEDS_PER_COMBO; i++) {
              const label = `${size}/${biome}/${settlement}/${i}`;
              const r = recipe(`sweep-${label}`, biome, settlement, size);
              // Throws MapGenerationError (naming the seed) on any invariant.
              const { map, diagnostics } = generateTacticalMapWithDiagnostics(
                r,
                {
                  registries,
                },
              );
              generations++;

              const index = new TileIndex(map);
              const definition = SETTLEMENT_DEFINITIONS[settlement];
              expect(map.buildings.length, label).toBeGreaterThan(0);
              expect(map.buildings.length, label).toBeLessThanOrEqual(
                Math.round(
                  definition.buildingCount.max *
                    areaFactor(map.width, map.depth),
                ),
              );
              if (settlement !== "rural") {
                expect(
                  map.buildings.some((b) => b.floors.length >= 2),
                  label,
                ).toBe(true);
                const bucket = tallMaps[settlement];
                if (bucket !== undefined) {
                  bucket.maps++;
                  if (map.buildings.some((b) => b.floors.length >= 3)) {
                    bucket.tall++;
                  }
                }
              }
              expect(map.props.length, label).toBeGreaterThan(0);
              interiorProps += map.props.filter(
                (p) => index.getAt(p.tile)?.buildingId !== undefined,
              ).length;
              expect(
                map.connectors.some((c) => c.kind === "stairs"),
                label,
              ).toBe(
                map.buildings.some(
                  (b) => b.floors.length >= 2 || b.roof.walkable,
                ),
              );

              const reach = new ReachabilityService(index, map.connectors);
              const reachable = reach.reachableFrom(
                map.hooks.deployZones.flatMap((z) => z.tiles),
                PassMask.INFANTRY,
              );
              for (const building of map.buildings) {
                buildings++;
                if (
                  !reach.anyReachable(
                    reachable,
                    building.entrances.map((e) => e.tile),
                  )
                ) {
                  unreachableEntrances++;
                }
              }
              hooks +=
                map.hooks.objectives.length + map.hooks.edgeSpawns.length;
              for (const objective of map.hooks.objectives) {
                const origin = objective.tiles[0];
                const radius = objective.meta?.hatchRadius;
                if (origin === undefined || typeof radius !== "number") {
                  continue;
                }
                if (
                  hatchSpace(
                    { index, reach },
                    origin,
                    radius,
                    PassMask.INFANTRY,
                  ) < HATCH_SPACE_MIN
                ) {
                  crampedSpawners++;
                }
              }
              relocations += diagnostics.notes.filter(
                (n) =>
                  n.pass === "connectivity" && n.message.includes("relocated"),
              ).length;
              // ADR 0008 §2.5 (#808): the terrain pass reports its largest
              // natural step and it is one layer (I11); every slope tile's
              // high neighbour is exactly one layer up and reached by the
              // free step both ways for both classes; no connector starts
              // on a slope tile (shape only, one derivation); no slope
              // carries a wall; no outer corner stands without two
              // straights; and the pass reports 100 % at the default knob.
              const terrainNote =
                diagnostics.notes.find((n) => n.pass === "terrain")?.message ??
                "";
              const stepMatch = /max natural step (\d+)/.exec(terrainNote);
              if (stepMatch === null || Number(stepMatch[1]) > 1) {
                naturalStepsOverOne++;
              }
              const slopeNote =
                diagnostics.notes.find((n) => n.pass === "slopes")?.message ??
                "";
              const shareMatch = /\((\d+) %\)/.exec(slopeNote);
              if (shareMatch !== null && Number(shareMatch[1]) < 100) {
                slopeRunsUnder100++;
              }
              // #847: the lower tile of a one-layer step carries a wedge or a
              // wall. Unpaved ground, water not adjacent, no connector on it,
              // one high side or two adjacent (the shapes the pass always
              // has a piece for): a bare block of earth here is the defect
              // QA catalogued as J2.
              const connectorFeet = new Set(
                map.connectors.flatMap((c) => [
                  `${String(c.from.x)},${String(c.from.z)}`,
                  `${String(c.to.x)},${String(c.to.z)}`,
                ]),
              );
              for (const tile of map.tiles) {
                if (
                  tile.buildingId !== undefined ||
                  tile.slope !== undefined ||
                  Object.keys(tile.walls).length > 0 ||
                  tile.surface === SurfaceIds.ROAD ||
                  tile.surface === SurfaceIds.SIDEWALK ||
                  tile.surface === SurfaceIds.WATER ||
                  tile.surface === SurfaceIds.FLOOR ||
                  tile.surface === SurfaceIds.ROOF ||
                  tile.surface === SurfaceIds.STAIRS ||
                  connectorFeet.has(`${String(tile.x)},${String(tile.z)}`) ||
                  index.get(tile.x, tile.y + 1, tile.z) !== undefined
                ) {
                  continue;
                }
                let waterNear = false;
                for (let dz = -1; dz <= 1; dz++) {
                  for (let dx = -1; dx <= 1; dx++) {
                    const column = index
                      .column(tile.x + dx, tile.z + dz)
                      .find((t) => t.surface === SurfaceIds.WATER);
                    if (column !== undefined) waterNear = true;
                  }
                }
                if (waterNear) continue;
                const highs = DIRECTIONS.filter((d) => {
                  const s = stepGridPos(tile, d);
                  const up = index.get(s.x, tile.y + 1, s.z);
                  return (
                    up !== undefined &&
                    up.buildingId === undefined &&
                    up.surface !== SurfaceIds.WATER
                  );
                });
                const adjacentPair =
                  highs.length === 2 &&
                  !(
                    (highs.includes("n") && highs.includes("s")) ||
                    (highs.includes("e") && highs.includes("w"))
                  );
                if (highs.length === 1 || adjacentPair) {
                  bareSteps++;
                }
              }
              // #863: a paved edge of two or more layers carries a wall or a
              // connector; a one-layer paved step is a kerb and stays bare.
              const joinedPairs = new Set(
                map.connectors.map(
                  (c) =>
                    `${String(c.from.x)},${String(c.from.z)}|${String(c.to.x)},${String(c.to.z)}`,
                ),
              );
              for (const tile of map.tiles) {
                if (
                  tile.buildingId !== undefined ||
                  (tile.surface !== SurfaceIds.ROAD &&
                    tile.surface !== SurfaceIds.SIDEWALK)
                ) {
                  continue;
                }
                for (const d of DIRECTIONS) {
                  const s = stepGridPos(tile, d);
                  const other = index
                    .column(s.x, s.z)
                    .find((t) => t.buildingId === undefined);
                  if (other === undefined || Math.abs(other.y - tile.y) < 2) {
                    continue;
                  }
                  const a = `${String(tile.x)},${String(tile.z)}|${String(other.x)},${String(other.z)}`;
                  const b = `${String(other.x)},${String(other.z)}|${String(tile.x)},${String(tile.z)}`;
                  if (
                    tile.walls[d] === undefined &&
                    other.walls[oppositeDirection(d)] === undefined &&
                    !joinedPairs.has(a) &&
                    !joinedPairs.has(b)
                  ) {
                    barePavedEdges++;
                  }
                }
              }
              const slopeColumns = new Set<string>();
              for (const tile of map.tiles) {
                if (tile.slope === undefined) {
                  continue;
                }
                slopeTiles++;
                slopeColumns.add(`${String(tile.x)},${String(tile.z)}`);
                if (Object.keys(tile.walls).length > 0) {
                  slopesWithWalls++;
                }
                if (tile.slope.kind === "straight") {
                  // #817: a concave corner is never left as a straight. Two
                  // adjacent high ground neighbours — prop or no prop — make
                  // it an inner corner, because the classifier reads levels.
                  const highs = DIRECTIONS.filter((d) => {
                    if (tile.walls[d] !== undefined) {
                      return false;
                    }
                    const s = stepGridPos(tile, d);
                    const up = index.get(s.x, tile.y + 1, s.z);
                    return up !== undefined && up.buildingId === undefined;
                  });
                  const opposite =
                    (highs.includes("n") && highs.includes("s")) ||
                    (highs.includes("e") && highs.includes("w"));
                  if (highs.length === 2 && !opposite) {
                    concaveLeftStraight++;
                  }
                }
                if (tile.slope.kind === "outer") {
                  const straights = DIRECTIONS.map((d) => {
                    const s = stepGridPos(tile, d);
                    return index.get(s.x, tile.y, s.z);
                  }).filter((t) => t?.slope?.kind === "straight").length;
                  if (straights < 2) {
                    orphanCorners++;
                  }
                  continue;
                }
                for (const side of highSides(tile.slope)) {
                  const step = stepGridPos(tile, side);
                  const upper = index.get(step.x, tile.y + 1, step.z);
                  if (upper === undefined) {
                    slopeStepsNotWalkable++;
                    continue;
                  }
                  for (const mask of [PassMask.INFANTRY, PassMask.MECH]) {
                    // A prop on either tile takes it out of the graph for
                    // everyone; the shape is still right (#817), the walk
                    // is simply not through that tile.
                    if ((tile.pass & mask) === 0 || (upper.pass & mask) === 0) {
                      continue;
                    }
                    if (
                      !reach.neighbours(tile, mask).includes(upper) ||
                      !reach.neighbours(upper, mask).includes(tile)
                    ) {
                      slopeStepsNotWalkable++;
                    }
                  }
                }
              }
              for (const c of map.connectors) {
                if (
                  slopeColumns.has(`${String(c.from.x)},${String(c.from.z)}`)
                ) {
                  connectorsFromSlopes++;
                }
              }

              // #785: a road never dies into a higher face. Every pair of
              // orthogonally adjacent road tiles on different levels is
              // joined by a connector, or the lower one dead-ends into a
              // wall — which is what a lifted carriageway did to the road
              // it crossed. Towns step roads onto the plat and ramp them;
              // cities used to fail this by the hundred.
              const joined = new Set(
                map.connectors.flatMap((c) => [
                  `${String(c.from.x)},${String(c.from.z)}|${String(c.to.x)},${String(c.to.z)}`,
                  `${String(c.to.x)},${String(c.to.z)}|${String(c.from.x)},${String(c.from.z)}`,
                ]),
              );
              for (const tile of map.tiles) {
                if (tile.surface !== SurfaceIds.ROAD) {
                  continue;
                }
                for (const [dx, dz] of [
                  [1, 0],
                  [0, 1],
                ] as const) {
                  const next = index
                    .column(tile.x + dx, tile.z + dz)
                    .find((c) => c.surface === SurfaceIds.ROAD);
                  if (next === undefined || next.y === tile.y) {
                    continue;
                  }
                  if (
                    !joined.has(
                      `${String(tile.x)},${String(tile.z)}|${String(next.x)},${String(next.z)}`,
                    )
                  ) {
                    roadStepsWithoutConnector++;
                  }
                }
              }
            }
          }
        }
      }
      expect(generations).toBeGreaterThanOrEqual(COMBOS * SEEDS_PER_COMBO);
      expect(unreachableEntrances / buildings).toBeLessThanOrEqual(0.03);
      // Every room kind is furnished (#202): measured ~2.6 per building.
      expect(interiorProps / buildings).toBeGreaterThanOrEqual(1);
      // Every spawner has room to hatch into (#231).
      expect(crampedSpawners).toBe(0);
      // Apartments give skylines height in every biome (#237): measured
      // 71/72 city and 67/72 town maps with a building of three floors.
      expect(
        (tallMaps.city?.tall ?? 0) / (tallMaps.city?.maps ?? 1),
      ).toBeGreaterThanOrEqual(0.95);
      expect(
        (tallMaps.town?.tall ?? 0) / (tallMaps.town?.maps ?? 1),
      ).toBeGreaterThanOrEqual(0.85);
      expect(relocations / hooks).toBeLessThanOrEqual(0.05);
      // No road dead-ends into a raised face (#785). Measured 0 on every
      // map of the matrix once road-surfaced features were disabled; the
      // number was 234-781 per twelve city maps before.
      expect(roadStepsWithoutConnector).toBe(0);
      // Natural edges are hillsides in half steps (#799, ADR 0008 §2.5):
      // I11 holds on every map, the pass slopes every run at the default
      // knob, every slope's high side is a free walk both ways for both
      // classes, a slope is shape only, never carries a wall, and a corner
      // never stands alone.
      expect(slopeTiles).toBeGreaterThan(0);
      expect(naturalStepsOverOne).toBe(0);
      expect(slopeRunsUnder100).toBe(0);
      expect(bareSteps).toBe(0);
      expect(barePavedEdges).toBe(0);
      expect(slopeStepsNotWalkable).toBe(0);
      expect(connectorsFromSlopes).toBe(0);
      expect(slopesWithWalls).toBe(0);
      expect(orphanCorners).toBe(0);
      expect(concaveLeftStraight).toBe(0);
    },
    SWEEP_TIMEOUT_MS,
  );

  it("matches the golden seeds", () => {
    const actual = GOLDENS.map((g) => {
      const map = generateTacticalMap(
        recipe(g.seed, g.biome, g.settlement, g.size),
        { registries },
      );
      // Half steps (#808) put natural ground on odd layers; the even-`y`
      // guard the engine child carried no longer applies.
      // Include each layer: a composite alone cannot catch a vertical unit regression.
      const layers = Array.from(
        { length: map.levels },
        (_, level) => `layer ${level}\n${renderAscii(map, { level })}`,
      ).join("\n");
      return { seed: g.seed, checksum: hashSeed(layers) };
    });
    expect(actual).toEqual(
      GOLDENS.map((g) => ({ seed: g.seed, checksum: g.checksum })),
    );
  });

  it("is unaffected by a pass inserted mid-pipeline (labelled forks)", () => {
    const r = recipe("fork-stability", "coastal", "city", "small");
    const noisy: GenerationPass = {
      id: "noise",
      requires: [],
      provides: [],
      run: (ctx): void => {
        for (let i = 0; i < 50; i++) {
          ctx.rng.next();
        }
      },
    };
    const plain = createSettlementPasses();
    const inserted = [...plain.slice(0, 4), noisy, ...plain.slice(4)];
    const a = new PipelineMapGenerator(plain, registries).run(
      r.params,
      new Mulberry32Rng(hashSeed(r.seed)),
    );
    const b = new PipelineMapGenerator(inserted, registries).run(
      r.params,
      new Mulberry32Rng(hashSeed(r.seed)),
    );
    expect(freezeDraft(a.draft, r, registries)).toEqual(
      freezeDraft(b.draft, r, registries),
    );
  });
});

/**
 * The sides a straight or inner slope rises onto, from its quarter turns
 * (south 0, west 1, north 2, east 3; an inner corner's second side is the
 * next turn clockwise). Mirrors `STRAIGHT_TURNS` / `CORNER_TURNS` in the
 * slope pass, on purpose: this is the sweep's own reading of the contract.
 */
function highSides(slope: NonNullable<Tile["slope"]>): readonly Direction[] {
  const ring: readonly Direction[] = ["s", "w", "n", "e"];
  const first = ring[slope.turns] ?? "s";
  if (slope.kind === "straight") {
    return [first];
  }
  return [first, ring[(slope.turns + 1) % 4] ?? "w"];
}

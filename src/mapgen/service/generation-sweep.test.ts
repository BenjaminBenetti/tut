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
import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import { TileIndex } from "./tile-index";

const registries = createDefaultRegistries();

/** Seeds per biome × settlement × size combination (36 combos). */
const SEEDS_PER_COMBO = 6;

/**
 * The sweep is the most expensive thing in the suite: 216 maps, 12–16 s
 * on an idle box across repeated runs, and a CI runner is about half
 * that speed. Thirty seconds was written when the sweep was smaller and
 * stopped being enough — it timed out on CI (#671) with no cost
 * regression behind it, measured at 12 s on the branch against 12 s on
 * `main`.
 *
 * The budget moves rather than the coverage: `generations` is asserted
 * at 200 or more precisely so nobody buys time by quietly sweeping
 * fewer maps, and that guard is right. What catches a generator that
 * has become slower is the wide sweep's runtime, not this number.
 */
const SWEEP_TIMEOUT_MS = 60_000;

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
    checksum: 2288975501,
  },
  {
    seed: "golden-snowy",
    biome: "snowy",
    settlement: "town",
    size: "medium",
    checksum: 2369789076,
  },
  {
    seed: "golden-desert",
    biome: "desert",
    settlement: "town",
    size: "medium",
    checksum: 2319165908,
  },
  {
    seed: "golden-coastal",
    biome: "coastal",
    settlement: "town",
    size: "medium",
    checksum: 2376744036,
  },
  {
    seed: "golden-rural",
    biome: "temperate",
    settlement: "rural",
    size: "small",
    checksum: 3107225177,
  },
  {
    seed: "golden-city",
    biome: "desert",
    settlement: "city",
    size: "large",
    checksum: 3562889357,
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
      let slopeConnectorsNotWalkable = 0;
      let slopesWithWalls = 0;
      let orphanCorners = 0;
      let slopeRunsUnder100 = 0;
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
              // #799: every natural level change is a slope at the default
              // knob — the pass reports its own share, and at slopeShare 1
              // (the sweep's default) it must be 100 % on every map. Every
              // straight or inner slope walks both ways for both classes;
              // no slope carries a wall (a wall marks a man-made edge); and
              // no outer corner stands without two straights beside it.
              const slopeNote =
                diagnostics.notes.find((n) => n.pass === "slopes")?.message ??
                "";
              const shareMatch = /\((\d+) %\)/.exec(slopeNote);
              if (shareMatch !== null && Number(shareMatch[1]) < 100) {
                slopeRunsUnder100++;
              }
              for (const tile of map.tiles) {
                if (tile.slope === undefined) {
                  continue;
                }
                slopeTiles++;
                if (Object.keys(tile.walls).length > 0) {
                  slopesWithWalls++;
                }
                if (tile.slope.kind === "outer") {
                  const straights = DIRECTIONS.map((d) => {
                    const s = stepGridPos(tile, d);
                    return index.get(s.x, tile.y, s.z);
                  }).filter((t) => t?.slope?.kind === "straight").length;
                  if (straights < 2) {
                    orphanCorners++;
                  }
                }
              }
              for (const c of map.connectors) {
                if (
                  c.kind !== "ramp" ||
                  index.getAt(c.from)?.slope === undefined
                ) {
                  continue;
                }
                const lower = index.getAt(c.from);
                const upper = index.getAt(c.to);
                if (lower === undefined || upper === undefined) {
                  slopeConnectorsNotWalkable++;
                  continue;
                }
                for (const mask of [PassMask.INFANTRY, PassMask.MECH]) {
                  if (
                    !reach.neighbours(lower, mask).includes(upper) ||
                    !reach.neighbours(upper, mask).includes(lower)
                  ) {
                    slopeConnectorsNotWalkable++;
                  }
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
      expect(generations).toBeGreaterThanOrEqual(200);
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
      // Natural edges are hillsides (#799): the pass slopes every one at
      // the default knob, every slope walks both ways for both classes, a
      // slope never carries a wall, and a corner never stands alone.
      expect(slopeTiles).toBeGreaterThan(0);
      expect(slopeRunsUnder100).toBe(0);
      expect(slopeConnectorsNotWalkable).toBe(0);
      expect(slopesWithWalls).toBe(0);
      expect(orphanCorners).toBe(0);
    },
    SWEEP_TIMEOUT_MS,
  );

  it("matches the golden seeds", () => {
    const actual = GOLDENS.map((g) => {
      const map = generateTacticalMap(
        recipe(g.seed, g.biome, g.settlement, g.size),
        { registries },
      );
      expect(map.levels % 2).toBe(0);
      expect(map.tiles.every((tile) => tile.y % 2 === 0)).toBe(true);
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

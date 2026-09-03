import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { DIRECTIONS } from "../../core/model/direction";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { manhattanDistance, stepGridPos } from "../../core/service/grid-math";
import { SETTLEMENT_DEFINITIONS } from "../data/settlements";
import type { MapDraft } from "../model/map-draft";
import type { MapGenParams, MapRecipe } from "../model/map-recipe";
import { allows, PassMask } from "../model/pass-mask";
import type { TacticalMap } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import { createDefaultRegistries } from "../service/default-registries";
import { freezeDraft } from "../service/draft-freezer";
import type { InvariantId } from "../service/map-validator";
import { validateTacticalMap } from "../service/map-validator";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { ReachabilityService } from "../service/reachability-service";
import { TileIndex } from "../service/tile-index";
import { BuildingPass } from "./building-pass";
import { InteriorPass } from "./interior-pass";
import { LotPass } from "./lot-pass";
import { PropPass } from "./prop-pass";
import { RampPass } from "./ramp-pass";
import { RoadPass } from "./road-pass";
import { TerrainPass } from "./terrain-pass";
import { WaterPass } from "./water-pass";

const registries = createDefaultRegistries();
const generator = new PipelineMapGenerator(
  [
    new TerrainPass(),
    new WaterPass(),
    new RoadPass(),
    new LotPass(),
    new BuildingPass(),
    new InteriorPass(),
    new PropPass(),
    new RampPass(),
  ],
  registries,
);

const STRUCTURAL: readonly InvariantId[] = ["I1", "I2", "I3", "I4", "I5"];

function run(
  biome: MapGenParams["biome"],
  settlement: MapGenParams["settlement"],
  seed: string,
): { draft: MapDraft; map: TacticalMap } {
  const params: MapGenParams = {
    archetype: "settlement",
    biome,
    settlement,
    size: "medium",
    hooks: [],
  };
  const recipe: MapRecipe = { seed, params };
  const { draft } = generator.run(params, new Mulberry32Rng(hashSeed(seed)));
  return { draft, map: freezeDraft(draft, recipe, registries) };
}

/** Exterior ground tiles a mech can stand on. */
function mechGround(map: TacticalMap): Tile[] {
  return map.tiles.filter(
    (tile) => tile.buildingId === undefined && allows(tile.pass, PassMask.MECH),
  );
}

/**
 * Component id per tile under the real rule (ramps only) and under the
 * ideal rule (every one-level step passable). Ramps are sufficient when
 * every ideal component maps onto exactly one real component.
 */
function componentsAgree(map: TacticalMap): boolean {
  const index = new TileIndex(map);
  const reach = new ReachabilityService(index, map.connectors);
  const ground = mechGround(map);
  const groundKeys = new Set(ground.map((t) => index.keyOf(t)));
  const real = new Map<number, number>();
  let realId = 0;
  for (const tile of ground) {
    const key = index.keyOf(tile);
    if (real.has(key)) continue;
    realId++;
    for (const reached of reach.reachableFrom([tile], PassMask.MECH)) {
      if (groundKeys.has(reached)) real.set(reached, realId);
    }
  }
  const ideal = new Map<number, number>();
  let idealId = 0;
  for (const tile of ground) {
    const start = index.keyOf(tile);
    if (ideal.has(start)) continue;
    idealId++;
    const stack = [tile];
    ideal.set(start, idealId);
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      for (const direction of DIRECTIONS) {
        for (const dy of [-1, 0, 1]) {
          const next = index.getAt(
            stepGridPos({ ...current, y: current.y + dy }, direction),
          );
          if (next === undefined) continue;
          const key = index.keyOf(next);
          if (!groundKeys.has(key) || ideal.has(key)) continue;
          if (dy === 0 && !reach.canStep(current, next, PassMask.MECH))
            continue;
          ideal.set(key, idealId);
          stack.push(next);
        }
      }
    }
  }
  const realOfIdeal = new Map<number, number>();
  for (const [key, idealComponent] of ideal) {
    const realComponent = real.get(key);
    if (realComponent === undefined) return false;
    const seen = realOfIdeal.get(idealComponent);
    if (seen === undefined) realOfIdeal.set(idealComponent, realComponent);
    else if (seen !== realComponent) return false;
  }
  return true;
}

const SEEDS = 5;

describe("RampPass", () => {
  it("joins every area a one-level step could join, across scales and biomes", () => {
    for (const settlement of SETTLEMENT_SCALES) {
      for (const biome of BIOME_IDS) {
        for (let i = 0; i < SEEDS; i++) {
          const label = `${settlement}/${biome}/${i}`;
          const { map } = run(biome, settlement, `ramp-${i}`);
          const violations = validateTacticalMap(map, registries).filter((v) =>
            STRUCTURAL.includes(v.invariant),
          );
          expect(
            violations.map((v) => `${v.invariant}: ${v.message}`),
            label,
          ).toEqual([]);
          expect(componentsAgree(map), label).toBe(true);
        }
      }
    }
  });

  it("only ramps between adjacent passable ground tiles one level apart", () => {
    const { map } = run("snowy", "rural", "geometry");
    const index = new TileIndex(map);
    const ramps = map.connectors.filter((c) => c.kind === "ramp");
    expect(ramps.length).toBeGreaterThan(0);
    for (const ramp of ramps) {
      const from = index.getAt(ramp.from);
      const to = index.getAt(ramp.to);
      expect(from?.buildingId, ramp.id).toBeUndefined();
      expect(to?.buildingId, ramp.id).toBeUndefined();
      expect(from?.propId, ramp.id).toBeUndefined();
      expect(to?.propId, ramp.id).toBeUndefined();
      expect(ramp.to.y - ramp.from.y, ramp.id).toBe(1);
      expect(manhattanDistance(ramp.from, ramp.to), ramp.id).toBe(1);
    }
  });

  it("keeps a ramp within rampSpacing of every one-level step", () => {
    for (const settlement of SETTLEMENT_SCALES) {
      const spacing = SETTLEMENT_DEFINITIONS[settlement].rampSpacing;
      for (let i = 0; i < SEEDS; i++) {
        const { map } = run("snowy", settlement, `spacing-${i}`);
        const index = new TileIndex(map);
        const ramps = map.connectors.filter((c) => c.kind === "ramp");
        for (const tile of mechGround(map)) {
          for (const direction of DIRECTIONS) {
            const upper = index.getAt(
              stepGridPos({ ...tile, y: tile.y + 1 }, direction),
            );
            if (
              upper === undefined ||
              upper.buildingId !== undefined ||
              !allows(upper.pass, PassMask.MECH)
            ) {
              continue;
            }
            const near = ramps.some(
              (r) =>
                manhattanDistance(r.from, tile) <= spacing ||
                manhattanDistance(r.to, tile) <= spacing,
            );
            expect(
              near,
              `${settlement}/${i} step at ${tile.x},${tile.y},${tile.z}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("is deterministic per seed", () => {
    expect(run("desert", "town", "det").map.connectors).toEqual(
      run("desert", "town", "det").map.connectors,
    );
  });
});

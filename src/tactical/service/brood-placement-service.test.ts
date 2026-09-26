import { describe, expect, it } from "vitest";

import { LURKER, SPITTER, SWARMER } from "../../bugs/data/species";
import { BUG_SPECIES } from "../../bugs/data/species";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import {
  HIVE_CAVERN_HOOKS,
  HIVE_CAVERN_SIZE,
} from "../../mapgen/data/hive-cavern-recipe";
import type { Hook } from "../../mapgen/model/hook";
import { allHooks, HookKinds } from "../../mapgen/model/hook";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { snapshotMap } from "../../mapgen/service/hatch-space";
import { BROOD_TUNING } from "../data/brood-tuning";
import type { BroodSetupDeps } from "../model/brood-tuning";
import type { TacticalState } from "../model/tactical-state";
import { isDormant } from "../model/unit";
import {
  broodPositions,
  broodSize,
  placeCavernBroods,
  placeDormantBrood,
} from "./brood-placement-service";
import { withinWakeZone } from "./brood-wake-service";
import { unitFootprintTiles } from "./footprint-service";
import { missionWith, unitAt } from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

const registries = createDefaultRegistries();

/** The shipped brood content, as the composition root passes it. */
const BROODS: BroodSetupDeps = {
  species: Object.values(BUG_SPECIES),
  tuning: BROOD_TUNING,
};

/** Seeds for the property sweep: every one a real hive cavern. */
const SEEDS = [
  "brood-1",
  "brood-2",
  "brood-3",
  "brood-4",
  "brood-5",
  "brood-6",
] as const;

/** Map generation under load: a cavern takes up to about 0.7 s. */
const SWEEP_TIMEOUT_MS = 120_000;

const caverns = new Map<string, TacticalMap>();

/** A generated hive cavern for the seed, generated once per file. */
function cavern(seed: string): TacticalMap {
  let map = caverns.get(seed);
  if (map === undefined) {
    map = generateTacticalMap(
      {
        seed,
        params: {
          archetype: "hive-cavern",
          biome: "temperate",
          settlement: "rural",
          size: HIVE_CAVERN_SIZE,
          hooks: HIVE_CAVERN_HOOKS,
        },
      },
      { registries },
    );
    caverns.set(seed, map);
  }
  return map;
}

/** The cavern's `brood-chamber` hooks, in map order. */
function chamberHooks(map: TacticalMap): readonly Hook[] {
  return map.hooks.objectives.filter(
    (hook) => hook.kind === HookKinds.BROOD_CHAMBER,
  );
}

/** A mission on the cavern with one squad on the deploy zone. */
function missionOn(
  map: TacticalMap,
  options: Partial<Pick<TacticalState, "difficulty" | "seed" | "bugMix">> = {},
): TacticalState {
  const deploy = map.hooks.deployZones[0]?.tiles[0];
  if (deploy === undefined) throw new Error("cavern without a deploy zone");
  return {
    ...missionWith(map, [unitAt("squad-1", "infantry", deploy)]),
    difficulty: 5,
    seed: 1179,
    ...options,
  };
}

/** Places the cavern's broods with fresh ids. */
function placed(state: TacticalState): TacticalState {
  return placeCavernBroods(state, state.map, {
    ids: new SequentialIdGenerator(),
    broods: BROODS,
  });
}

/** The radius a `brood-chamber` hook records. */
function radiusOf(hook: Hook): number {
  const radius = hook.meta?.radius;
  if (typeof radius !== "number") throw new Error(`${hook.id} has no radius`);
  return radius;
}

// ===========================================
// placeCavernBroods
// ===========================================

describe("placeCavernBroods on real hive caverns", () => {
  it(
    "stands one sleeping brood per brood-chamber hook, every bug inside its chamber's radius, on free standable ground (property over seeds)",
    () => {
      for (const seed of SEEDS) {
        const map = cavern(seed);
        const hooks = chamberHooks(map);
        expect(hooks.length, seed).toBeGreaterThan(0);
        const mission = placed(missionOn(map));
        expect(mission.broods?.length, seed).toBe(hooks.length);
        const snapshot = snapshotMap(map);
        const hookKeys = new Set(
          allHooks(map.hooks).flatMap((hook) =>
            hook.tiles.map((tile) => snapshot.index.keyOf(tile)),
          ),
        );
        const held = new Set<number>();
        for (const unit of mission.units) {
          for (const tile of unitFootprintTiles(mission, unit)) {
            const key = snapshot.index.keyOf(tile);
            expect(held.has(key), `${seed}: ${unit.id} overlaps`).toBe(false);
            held.add(key);
          }
        }
        const members = new Set<string>();
        for (const hook of hooks) {
          const brood = mission.broods?.find(
            (entry) => entry.id === `brood-${String(hook.meta?.chamberId)}`,
          );
          expect(brood, `${seed}: ${hook.id}`).toBeDefined();
          if (brood === undefined) continue;
          expect(brood.wake).toEqual({
            centre: {
              x: hook.tiles[0]?.x,
              y: hook.tiles[0]?.y,
              z: hook.tiles[0]?.z,
            },
            radius: radiusOf(hook),
          });
          expect(brood.memberIds.length, `${seed}: ${brood.id}`).toBe(
            broodSize(hook, 5, BROOD_TUNING),
          );
          for (const memberId of brood.memberIds) {
            expect(members.has(memberId)).toBe(false);
            members.add(memberId);
            const unit = mission.units.find((entry) => entry.id === memberId);
            expect(unit?.team).toBe("bugs");
            expect(unit !== undefined && isDormant(unit)).toBe(true);
            if (unit === undefined) continue;
            expect(
              withinWakeZone(brood.wake, unit.pos),
              `${seed}: ${memberId} at ${JSON.stringify(unit.pos)}`,
            ).toBe(true);
            for (const tile of unitFootprintTiles(mission, unit)) {
              const standing = snapshot.index.getAt(tile);
              expect(standing).toBeDefined();
              if (standing === undefined) continue;
              expect(
                snapshot.reach.canOccupy(standing, PassMask.INFANTRY),
              ).toBe(true);
            }
            expect(hookKeys.has(snapshot.index.keyOf(unit.pos))).toBe(false);
          }
        }
        // Every bug on the map is a brood member: nothing else was placed.
        expect(
          mission.units.filter((unit) => unit.team === "bugs").length,
        ).toBe(members.size);
      }
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    "fills a brood to size from its spare tiles when bugs already hold half the chamber",
    () => {
      const map = cavern(SEEDS[3]);
      const hook = chamberHooks(map)[0];
      if (hook === undefined) throw new Error("cavern without chambers");
      const floor = broodPositions(map, hook, 10_000, new Mulberry32Rng(7));
      const squatters = floor
        .filter((_, i) => i % 2 === 0)
        .map((tile, i) =>
          unitAt(`squatter-${String(i)}`, "infantry", tile, { team: "bugs" }),
        );
      const base = missionOn(map);
      const crowded = { ...base, units: [...base.units, ...squatters] };
      const mission = placed(crowded);
      const brood = mission.broods?.[0];
      expect(brood?.memberIds.length).toBe(broodSize(hook, 5, BROOD_TUNING));
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    "is deterministic per mission seed, and another seed sleeps the broods elsewhere",
    () => {
      const map = cavern(SEEDS[0]);
      const first = placed(missionOn(map));
      const again = placed(missionOn(map));
      expect(again).toEqual(first);
      const other = placed(missionOn(map, { seed: 1180 }));
      expect(other.units.map((unit) => unit.pos)).not.toEqual(
        first.units.map((unit) => unit.pos),
      );
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    "rolls species from the mission's frozen bug mix, else swarmers and lurkers",
    () => {
      const map = cavern(SEEDS[1]);
      const mixed = placed(missionOn(map, { bugMix: { spitter: 1 } }));
      const bugs = mixed.units.filter((unit) => unit.team === "bugs");
      expect(bugs.length).toBeGreaterThan(0);
      expect(new Set(bugs.map((unit) => unit.sourceId))).toEqual(
        new Set([SPITTER.id]),
      );
      const plain = placed(missionOn(map));
      const kinds = new Set(
        plain.units
          .filter((unit) => unit.team === "bugs")
          .map((unit) => unit.sourceId),
      );
      expect(kinds).toEqual(new Set([SWARMER.id, LURKER.id]));
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    "grows the broods with difficulty",
    () => {
      const map = cavern(SEEDS[2]);
      const count = (difficulty: number): number =>
        placed(missionOn(map, { difficulty })).units.filter(
          (unit) => unit.team === "bugs",
        ).length;
      expect(count(9)).toBeGreaterThan(count(1));
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    "places nothing without the brood content, and nothing on a map with no chambers",
    () => {
      const mission = missionOn(cavern(SEEDS[0]));
      expect(
        placeCavernBroods(mission, mission.map, {
          ids: new SequentialIdGenerator(),
        }),
      ).toBe(mission);
      const field = missionWith(
        new FixtureMapBuilder(8, 8, 3).fillGround().build(),
        [],
      );
      expect(
        placeCavernBroods(field, field.map, {
          ids: new SequentialIdGenerator(),
          broods: BROODS,
        }),
      ).toBe(field);
    },
    SWEEP_TIMEOUT_MS,
  );
});

describe("broodSize", () => {
  const hook = (role: string): Hook => ({
    id: "h",
    kind: HookKinds.BROOD_CHAMBER,
    tiles: [at(0, 0)],
    requiredPass: PassMask.ALL,
    meta: { role, radius: 8, chamberId: "chamber-1", depth: 2 },
  });

  it("scales by difficulty and by the chamber's role, within the clamp", () => {
    // (9 + 0.5 × 4) = 11, × 0.75 = 8.25, × 1.5 = 16.5 (rounds half up).
    expect(broodSize(hook("route"), 4, BROOD_TUNING)).toBe(11);
    expect(broodSize(hook("side"), 4, BROOD_TUNING)).toBe(8);
    expect(broodSize(hook("core"), 4, BROOD_TUNING)).toBe(17);
    expect(broodSize(hook("route"), 100, BROOD_TUNING)).toBe(
      BROOD_TUNING.maxSize,
    );
    expect(broodSize(hook("side"), 0, { ...BROOD_TUNING, baseSize: 1 })).toBe(
      BROOD_TUNING.minSize,
    );
    expect(broodSize(hook("unknown"), 0, BROOD_TUNING)).toBe(9);
  });
});

// ===========================================
// placeDormantBrood and broodPositions
// ===========================================

describe("placeDormantBrood", () => {
  const field = (): TacticalState =>
    missionWith(new FixtureMapBuilder(12, 12, 3).fillGround().build(), [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("taken", "infantry", at(6, 6), { team: "bugs" }),
    ]);
  const wake = { centre: at(5, 5), radius: 3 };

  it("stands dormant bugs on the free positions and records them as one brood", () => {
    const state = field();
    const ids = new SequentialIdGenerator();
    const after = placeDormantBrood(
      state,
      {
        broodId: "brood-x",
        species: SWARMER,
        positions: [at(5, 5), at(6, 6), at(4, 5)],
        wake,
        label: "west chamber",
      },
      { ids },
    );
    const newcomers = after.units.slice(state.units.length);
    expect(newcomers.map((unit) => unit.pos)).toEqual([at(5, 5), at(4, 5)]);
    expect(newcomers.every((unit) => isDormant(unit))).toBe(true);
    expect(after.broods).toEqual([
      {
        id: "brood-x",
        wake,
        memberIds: newcomers.map((unit) => unit.id),
        label: "west chamber",
      },
    ]);
    // A second species joins the same brood.
    const joined = placeDormantBrood(
      after,
      { broodId: "brood-x", species: LURKER, positions: [at(3, 5)], wake },
      { ids },
    );
    expect(joined.broods?.length).toBe(1);
    expect(joined.broods?.[0]?.memberIds.length).toBe(3);
  });

  it("returns the mission itself when no position can hold a bug", () => {
    const state = field();
    expect(
      placeDormantBrood(
        state,
        { broodId: "brood-x", species: SWARMER, positions: [at(6, 6)], wake },
        { ids: new SequentialIdGenerator() },
      ),
    ).toBe(state);
  });
});

describe("broodPositions", () => {
  it("picks distinct standable tiles within the radius, reachable from the hook without crossing a wall, off every hook tile", () => {
    // A solid wall east of x = 5, no door: tiles at x ≥ 6 are inside the
    // radius but behind the chamber's wall.
    const builder = new FixtureMapBuilder(14, 14, 3).fillGround();
    for (let z = 0; z < 14; z++) {
      builder.wall({ x: 5, y: 0, z }, "e", "solid");
    }
    builder.deploy([at(3, 3)]);
    builder.objective(HookKinds.BROOD_CHAMBER, [at(3, 7)], PassMask.ALL, {
      chamberId: "chamber-1",
      role: "route",
      radius: 4,
      depth: 1,
    });
    const map = builder.build();
    const hook = chamberHooks(map)[0];
    if (hook === undefined) throw new Error("fixture lost its hook");
    const tiles = broodPositions(map, hook, 500, new Mulberry32Rng(3));
    expect(tiles.length).toBeGreaterThan(10);
    const keys = new Set(tiles.map((tile) => `${tile.x},${tile.z}`));
    expect(keys.size).toBe(tiles.length);
    for (const tile of tiles) {
      expect(withinWakeZone({ centre: at(3, 7), radius: 4 }, tile)).toBe(true);
      expect(tile.x).toBeLessThanOrEqual(5);
    }
    expect(keys.has("3,7")).toBe(false);
    expect(keys.has("3,3")).toBe(false);
    expect(broodPositions(map, hook, 5, new Mulberry32Rng(3))).toHaveLength(5);
  });
});

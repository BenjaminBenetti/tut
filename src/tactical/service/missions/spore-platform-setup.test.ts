import { describe, expect, it, vi } from "vitest";

import { BUG_SPECIES } from "../../../bugs/data/species";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { Mission } from "../../../overworld/model/mission";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { PLATFORM_ASSAULT_TUNING } from "../../data/platform-assault-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { CoreBoss, CoreBossPlacement } from "../../model/core-boss";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type { TacticalState } from "../../model/tactical-state";
import { spawnerFootprintTiles } from "../footprint-service";
import { buildMoveGraph, occupiedKeys } from "../movement-service";
import { spawnerMiddleTile } from "../objectives/wreck-objectives";
import {
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { MISSION_SETUP_RULES } from "./mission-setup-rules";
import {
  PLATFORM_GUARD_SPECIES,
  createSporePlatformSetup,
} from "./spore-platform-setup";

// ===========================================
// Fixtures
// ===========================================

/** Ground tile (x, z). */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/** The side-`n` square with its lowest corner at (x, z), row by row. */
function square(x: number, z: number, n: number): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let dz = 0; dz < n; dz++) {
    for (let dx = 0; dx < n; dx++) {
      tiles.push(at(x + dx, z + dz));
    }
  }
  return tiles;
}

const RING = square(0, 0, 2);
const HATCH = square(6, 6, 2);

/**
 * The hull on an 8 × 8 field: the docking ring in one corner, the hatch
 * in the other, one pod bed between.
 *
 * ```
 *   z=7 . . . . . . H H
 *   z=6 . . . . . . H H     H hatch (platform-exit)
 *   z=4 . . . N . . . .     N pod bed (egg-spawner)
 *   z=1 R R . . . . . .
 *   z=0 R R . . . . . .     R docking ring; the drop ship's extraction on (0, 0)
 * ```
 */
function hullMap(): TacticalMap {
  return openField()
    .deploy([at(0, 0)])
    .objective(HookKinds.DOCKING_RING, RING, undefined, { footprint: 2 })
    .objective(HookKinds.EGG_SPAWNER, [at(3, 4)])
    .objective(HookKinds.PLATFORM_EXIT, HATCH, undefined, { footprint: 2 })
    .build();
}

const CORE_PAD = square(3, 3, 3);
const DAIS = square(6, 6, 2);

/**
 * The core chamber on an 8 × 8 field: the core's pad in the middle, two
 * guard posts, a wall pod and the dais.
 *
 * ```
 *   z=7 G G . . . . D D
 *   z=6 G G . . . . D D     D sovereign-dais, G guard posts
 *   z=5 . . . C C C . .
 *   z=4 . . . C C C . N     C the core's pad, which the 3×3 core fills
 *                           from (3, 3); its middle (4, 4); N wall pod
 *   z=3 . . . C C C . .
 *   z=1 . . . . . . G G
 *   z=0 S . . . . . G G     S the start pad
 * ```
 */
function coreMap(withPad = true): TacticalMap {
  const builder = openField()
    .deploy([at(0, 0)])
    .objective(HookKinds.EGG_SPAWNER, [at(7, 4)])
    .objective(HookKinds.GUARD_POST, square(0, 6, 2), undefined, {
      footprint: 2,
    })
    .objective(HookKinds.GUARD_POST, square(6, 0, 2), undefined, {
      footprint: 2,
    })
    .objective(HookKinds.SOVEREIGN_DAIS, DAIS, undefined, { footprint: 2 });
  return (
    withPad
      ? builder.objective(HookKinds.PLATFORM_CORE, CORE_PAD, undefined, {
          footprint: 3,
        })
      : builder
  ).build();
}

/** The finale's offer: fixed difficulty 10, a finale mix frozen on it. */
const OFFER: Mission = {
  id: "mission-1",
  typeId: "spore-platform",
  cityId: "city-1",
  difficulty: 10,
  mapParams: {
    biome: "snowy",
    settlement: "town",
    size: "large",
    seed: "platform",
  },
  rewards: { credits: 0, techPoints: 0 },
  createdDay: 300,
  expiresDay: 305,
  ignorePenalty: 0,
  storyId: "spore-platform",
  act: "finale",
  bugMix: { swarmer: 0.6, brute: 0.4 },
};

/** A boss that records every placement and stands one bug where it is told. */
function spyBoss(): {
  readonly boss: CoreBoss;
  readonly place: ReturnType<typeof vi.fn>;
} {
  const place = vi.fn(
    (
      state: TacticalState,
      position: TileCoord,
      deps: CoreBossPlacement,
    ): TacticalState => ({
      ...state,
      units: [
        ...state.units,
        unitAt(deps.ids.nextId("unit"), "infantry", position, {
          team: "bugs",
        }),
      ],
    }),
  );
  return {
    boss: {
      species: BUG_SPECIES.brute,
      escort: ["swarmer-armoured", "lurker-armoured"],
      place,
    },
    place,
  };
}

/** Setup deps with a fresh id counter, the shipped species, and a boss if given. */
function setupDeps(boss?: CoreBoss): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
    species: Object.values(BUG_SPECIES),
    ...(boss === undefined ? {} : { coreBoss: boss }),
  };
}

/** A base state on the core stage, the finale mix on it, one survivor on the start pad. */
function coreBase(map: TacticalMap): TacticalState {
  return {
    ...missionWith(map, [unitAt("mech-1", "mech", at(0, 0))]),
    stage: { index: 1, count: 2, earlier: [] },
    bugMix: OFFER.bugMix,
  };
}

const RULE = createSporePlatformSetup(PLATFORM_ASSAULT_TUNING);

// ===========================================
// The table
// ===========================================

describe("spore-platform in MISSION_SETUP_RULES", () => {
  it("is a spore-platform rule the region's batteries do not reach", () => {
    const rule = MISSION_SETUP_RULES["spore-platform"];
    expect(rule.typeId).toBe("spore-platform");
    expect(rule.garrisoned).toBe(false);
  });
});

// ===========================================
// The hull
// ===========================================

describe("the hull (stage 1 of 2)", () => {
  it("deploys the squad on the docking ring, and the core chamber on its start pad", () => {
    expect(RULE.deployTiles?.(hullMap(), 0)).toEqual(RING);
    expect(RULE.deployTiles?.(coreMap(), 1)).toBeUndefined();
  });

  it("stands the pod beds' nests with no objective, one board-core, and the hatch as the only way out", () => {
    const map = hullMap();
    const setUp = RULE.setup(
      missionWith(map, [unitAt("mech-1", "mech", at(0, 0))]),
      map,
      OFFER,
      setupDeps(),
    );
    expect(setUp.ok).toBe(true);
    if (!setUp.ok) return;
    const state = setUp.value;
    expect(state.spawners.map((spawner) => [spawner.id, spawner.pos])).toEqual([
      ["spawner-1", at(3, 4)],
    ]);
    expect(state.objectives).toEqual([
      { id: "objective-1", kind: "board-core", complete: false },
    ]);
    expect(state.extraction).toEqual(HATCH);
    expect(state.endsOnObjectives).toBeUndefined();
  });

  it("keeps the drop ship's extraction on a deck without a hatch", () => {
    const map = openField()
      .deploy([at(0, 0)])
      .build();
    const base = { ...missionWith(map, []), extraction: [at(0, 0)] };
    const setUp = RULE.setup(base, map, OFFER, setupDeps());
    expect(setUp.ok && setUp.value.extraction).toEqual([at(0, 0)]);
  });

  it("places no boss and no guard on the hull, even with one in the deps", () => {
    const { boss, place } = spyBoss();
    const map = hullMap();
    const setUp = RULE.setup(missionWith(map, []), map, OFFER, setupDeps(boss));
    expect(setUp.ok && setUp.value.units).toEqual([]);
    expect(place).not.toHaveBeenCalled();
  });
});

// ===========================================
// The core chamber
// ===========================================

describe("the core chamber (stage 2 of 2)", () => {
  it("stands the 3×3 core centred on the pad's middle tile (here the whole pad), at the tuning's hit points, and one destroy-platform-core objective", () => {
    const map = coreMap();
    const setUp = RULE.setup(coreBase(map), map, OFFER, setupDeps());
    expect(setUp.ok).toBe(true);
    if (!setUp.ok) return;
    const state = setUp.value;
    expect(state.spawners[0]).toEqual({
      id: "spawner-1",
      variant: "platform-core",
      pos: CORE_PAD[0],
      // The default: the core never hatches, so the radius is never read.
      hatchRadius: 3,
      hp: PLATFORM_ASSAULT_TUNING.coreHp,
      timer: 0,
      destroyed: false,
    });
    expect(state.objectives).toEqual([
      {
        id: "objective-1",
        kind: "destroy-platform-core",
        targetId: "spawner-1",
        coreHp: PLATFORM_ASSAULT_TUNING.coreHp,
        complete: false,
      },
    ]);
    // The wall pod after the core, with no objective of its own.
    expect(state.spawners.map((spawner) => [spawner.id, spawner.pos])).toEqual([
      ["spawner-1", at(3, 3)],
      ["spawner-2", at(7, 4)],
    ]);
    // It stands on every tile of its pad, and nobody walks through them.
    const core = state.spawners[0];
    if (core === undefined) throw new Error("the core stands");
    expect(spawnerFootprintTiles(core)).toEqual(CORE_PAD);
    const { index } = buildMoveGraph(map);
    const held = occupiedKeys(state, index);
    for (const tile of CORE_PAD) {
      expect(held.has(index.keyOf(tile))).toBe(true);
    }
    expect(spawnerMiddleTile(core)).toEqual(at(4, 4));
  });

  it("ends on its objective, with nowhere to extract to", () => {
    const map = coreMap();
    const setUp = RULE.setup(coreBase(map), map, OFFER, setupDeps());
    expect(setUp.ok && setUp.value.extraction).toEqual([]);
    expect(setUp.ok && setUp.value.endsOnObjectives).toBe(true);
  });

  it("stands one Hive Guard on each guard post's first tile", () => {
    const map = coreMap();
    const setUp = RULE.setup(coreBase(map), map, OFFER, setupDeps());
    expect(setUp.ok).toBe(true);
    if (!setUp.ok) return;
    const guards = setUp.value.units.filter((unit) => unit.team === "bugs");
    expect(guards.map((unit) => unit.pos)).toEqual([at(0, 6), at(6, 0)]);
    expect(
      guards.map((unit) => setUp.value.templates[unit.templateId]?.name),
    ).toEqual(["Hive Guard", "Hive Guard"]);
    // No boss in the deps: nobody on the dais, the offer's mix as it is.
    expect(setUp.value.bugMix).toEqual(OFFER.bugMix);
  });

  it("stands the boss on the dais guarding the core, at the offer's difficulty, and blends her escort into the waves", () => {
    const { boss, place } = spyBoss();
    const map = coreMap();
    const setUp = RULE.setup(coreBase(map), map, OFFER, setupDeps(boss));
    expect(setUp.ok).toBe(true);
    if (!setUp.ok) return;
    expect(place).toHaveBeenCalledTimes(1);
    const [, position, deps] = place.mock.calls[0] as [
      TacticalState,
      TileCoord,
      CoreBossPlacement,
    ];
    expect(position).toEqual(DAIS[0]);
    expect(deps.core).toEqual(at(4, 4));
    expect(deps.species).toBe(BUG_SPECIES.brute);
    expect(deps.difficulty).toBe(10);
    expect(setUp.value.units.at(-1)?.pos).toEqual(DAIS[0]);
    const mix = setUp.value.bugMix ?? {};
    const share = PLATFORM_ASSAULT_TUNING.escortShare;
    expect(mix.swarmer).toBeCloseTo(0.6 * (1 - share));
    expect(mix.brute).toBeCloseTo(0.4 * (1 - share));
    expect(mix["swarmer-armoured"]).toBeCloseTo(share / 2);
    expect(mix["lurker-armoured"]).toBeCloseTo(share / 2);
  });

  it("refuses a chamber without the core's pad, and a species list without the Hive Guard", () => {
    const noPad = coreMap(false);
    expect(RULE.setup(coreBase(noPad), noPad, OFFER, setupDeps())).toEqual({
      ok: false,
      error: {
        kind: "map-recipe",
        reason: "the core chamber has no platform core",
      },
    });
    const map = coreMap();
    const noGuard: MissionSetupDeps = {
      ...setupDeps(),
      species: Object.values(BUG_SPECIES).filter(
        (species) => species.id !== PLATFORM_GUARD_SPECIES,
      ),
    };
    expect(RULE.setup(coreBase(map), map, OFFER, noGuard)).toEqual({
      ok: false,
      error: {
        kind: "unknown-unit-type",
        unitKind: "bug",
        id: PLATFORM_GUARD_SPECIES,
      },
    });
  });
});

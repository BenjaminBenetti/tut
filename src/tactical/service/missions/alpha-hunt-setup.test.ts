import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../../bugs/data/species";
import { fieldMap } from "../../../bugs/service/broodmother.test-helper";
import {
  broodmotherHp,
  isBroodmother,
} from "../../../bugs/service/broodmother-service";
import { MISSION_TYPES } from "../../../content/data/mission-types";
import { BIOME_IDS } from "../../../content/model/biome-id";
import type { MapSizeId } from "../../../content/model/map-size-id";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { manhattanDistance } from "../../../core/service/grid-math";
import { ECONOMY_TUNING } from "../../../economy/data/economy-tuning";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { createDefaultRegistries } from "../../../mapgen/service/default-registries";
import { EARTH_MAP } from "../../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../../overworld/data/threat-tuning";
import type { Mission } from "../../../overworld/model/mission";
import { MECH_RATING_TUNING } from "../../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../../roster/data/parts";
import { SQUAD_TYPES } from "../../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../../roster/service/loadout-validation-service";
import type { GameState } from "../../../save/model/game-state";
import { createNewGame } from "../../../save/service/new-game-service";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GARRISON_TUNING } from "../../data/garrison-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import { UNIT_TUNING } from "../../data/unit-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type { TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { footprintTiles } from "../footprint-service";
import { touchesMapEdge } from "../map-edge-service";
import { searchMoves } from "../movement-service";
import type { MissionStartDeps } from "../mission-start-service";
import { startTacticalMission } from "../mission-start-service";
import { missionWith, unitAt } from "../tactical-fixtures.test-helper";
import {
  ALPHA_HUNT_SETUP,
  BROODMOTHER_LAIR_CLEARANCE,
  broodmotherLair,
} from "./alpha-hunt-setup";
import { MISSION_SETUP_RULES } from "./mission-setup-rules";

// ===========================================
// Fixtures
// ===========================================

/** Ground tile (x, z). */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/** A hunt for `name` with `scars` earlier escapes, on a map of `size`. */
function huntFor(
  options: {
    name?: string;
    scars?: number;
    size?: MapSizeId;
    biome?: Mission["mapParams"]["biome"];
    seed?: string;
    difficulty?: number;
  } = {},
): Mission {
  return {
    id: "mission-1",
    typeId: "alpha-hunt",
    cityId: "city-1",
    difficulty: options.difficulty ?? 3,
    mapParams: {
      biome: options.biome ?? "temperate",
      settlement: "town",
      size: options.size ?? "medium",
      seed: options.seed ?? "alpha-hunt-setup",
    },
    rewards: { credits: 0, techPoints: 0 },
    createdDay: 5,
    expiresDay: 9,
    ignorePenalty: 15,
    alphaHunt: {
      name: options.name ?? "Old Scald",
      scars: options.scars ?? 0,
    },
  };
}

/**
 * A 40×40 field: the deploy zone the 3×3 at the origin, a nest on the
 * east edge, the extraction the 2×2 at the far north-west.
 */
function huntField() {
  return huntField40().build();
}

/** `huntField`, still open for more walls. */
function huntField40(): ReturnType<typeof fieldMap> {
  return fieldMap(40, 40)
    .deploy([0, 1, 2].flatMap((x) => [0, 1, 2].map((z) => at(x, z))))
    .objective(HookKinds.EGG_SPAWNER, [at(38, 20)])
    .extraction([at(0, 38), at(1, 38), at(0, 39), at(1, 39)]);
}

/** Setup deps with a fresh id counter and the shipped species. */
function setupDeps(
  species: MissionSetupDeps["species"] = Object.values(BUG_SPECIES),
): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
    species,
  };
}

/** Her unit on a set-up mission. */
function motherOn(mission: TacticalState): Unit {
  const mother = mission.units.find(isBroodmother);
  if (mother === undefined) {
    throw new Error("no Broodmother on the mission");
  }
  return mother;
}

/** Steps her 3×3 block at `anchor` must walk before it touches an edge. */
function edgeDistance(
  anchor: TileCoord,
  map: { width: number; depth: number },
): number {
  return Math.min(
    anchor.x,
    anchor.z,
    map.width - (anchor.x + 3),
    map.depth - (anchor.z + 3),
  );
}

/** The fewest Manhattan steps from any tile of her block to any deploy tile. */
function deployDistance(mission: TacticalState, anchor: TileCoord): number {
  const deploy = mission.map.hooks.deployZones.flatMap((zone) => zone.tiles);
  return Math.min(
    ...footprintTiles(anchor, 3).flatMap((tile) =>
      deploy.map((zone) => manhattanDistance(tile, zone)),
    ),
  );
}

/**
 * Whether her block can walk from where she stands to a tile touching
 * the map edge, searched as her flight searches (`searchMoves`, a budget
 * no map exhausts).
 */
function hasWayOut(mission: TacticalState, mother: Unit): boolean {
  const search = searchMoves(mission, { ...mother, ap: 10_000 });
  return [...search.tiles.values()].some((tile) =>
    touchesMapEdge(mission.map, tile, 3),
  );
}

/**
 * Solid walls around the square [lo, hi]², on its outer sides, with a
 * one-tile gap at (door, hi) when `door` is given: a squad walks through
 * the gap, her 3×3 block does not.
 */
function ring(
  builder: ReturnType<typeof fieldMap>,
  lo: number,
  hi: number,
  door?: number,
): ReturnType<typeof fieldMap> {
  for (let t = lo; t <= hi; t++) {
    builder.wall(at(t, lo), "n", "solid");
    if (t !== door) builder.wall(at(t, hi), "s", "solid");
    builder.wall(at(lo, t), "w", "solid");
    builder.wall(at(hi, t), "e", "solid");
  }
  return builder;
}

// ===========================================
// The rule on a fixture map
// ===========================================

describe("ALPHA_HUNT_SETUP (#1179, campaign arc §6.8)", () => {
  it("is the table's setup for the hunt", () => {
    expect(MISSION_SETUP_RULES["alpha-hunt"]).toBe(ALPHA_HUNT_SETUP);
  });

  it("stands her nests, then her, named, in the middle, with one objective on her", () => {
    const map = huntField();
    const base = missionWith(map, [unitAt("squad-1", "infantry", at(0, 0))], {
      difficulty: 3,
    });
    const setUp = ALPHA_HUNT_SETUP.setup(base, map, huntFor(), setupDeps());
    expect(setUp.ok).toBe(true);
    if (!setUp.ok) return;
    const mission = setUp.value;
    expect(mission.spawners.map((spawner) => spawner.pos)).toEqual([
      at(38, 20),
    ]);
    const mother = motherOn(mission);
    // The block's centre on the map's: anchor (19, 19) holds (20, 20).
    expect(mother.pos).toEqual(at(19, 19));
    expect(mother.name).toBe("Old Scald");
    expect(mother.persona).toBe("broodmother");
    expect(mother.hp).toBe(broodmotherHp(3, 0));
    expect(mission.objectives).toEqual([
      {
        id: "objective-1",
        kind: "kill-broodmother",
        targetId: mother.id,
        complete: false,
        failed: false,
      },
    ]);
  });

  it("carries her scars into her hit points", () => {
    const map = huntField();
    const base = missionWith(map, [], { difficulty: 4 });
    const hp = (scars: number): number | undefined => {
      const setUp = ALPHA_HUNT_SETUP.setup(
        base,
        map,
        huntFor({ scars }),
        setupDeps(),
      );
      return setUp.ok ? motherOn(setUp.value).hp : undefined;
    };
    expect(hp(0)).toBe(broodmotherHp(4, 0));
    expect(hp(2)).toBe(broodmotherHp(4, 2));
    expect(hp(2)).toBeGreaterThan(hp(0) ?? Number.POSITIVE_INFINITY);
  });

  it("refuses without the Broodmother among the species, or with nowhere to stand her", () => {
    const map = huntField();
    const base = missionWith(map, []);
    expect(
      ALPHA_HUNT_SETUP.setup(base, map, huntFor(), setupDeps([])),
    ).toMatchObject({ ok: false, error: { kind: "unknown-unit-type" } });
    // A 4×4 field whose deploy zone takes the middle: no 3×3 is clear.
    const cramped = fieldMap(4, 4)
      .deploy([at(1, 1), at(2, 2)])
      .build();
    expect(
      ALPHA_HUNT_SETUP.setup(
        missionWith(cramped, []),
        cramped,
        huntFor(),
        setupDeps(),
      ),
    ).toMatchObject({ ok: false, error: { kind: "map-recipe" } });
  });
});

describe("ALPHA_HUNT_SETUP: a way out", () => {
  it("passes over a lair her block could never leave for ground with a way out", () => {
    // A walled yard in the middle, its one gap a squad's width: the
    // squad walks in, her 3×3 never walks out. Everything the clearance
    // prefers is inside it.
    const map = ring(huntField40(), 12, 27, 20).build();
    expect(broodmotherLair(map, [], 3)[0]).toEqual(at(19, 19));
    const setUp = ALPHA_HUNT_SETUP.setup(
      missionWith(map, [unitAt("squad-1", "infantry", at(0, 0))]),
      map,
      huntFor(),
      setupDeps(),
    );
    expect(setUp.ok).toBe(true);
    if (!setUp.ok) return;
    const mother = motherOn(setUp.value);
    const inYard = (tile: TileCoord): boolean =>
      tile.x >= 12 && tile.x <= 27 && tile.z >= 12 && tile.z <= 27;
    expect(footprintTiles(mother.pos, 3).some(inYard)).toBe(false);
    expect(hasWayOut(setUp.value, mother)).toBe(true);
  });

  it("still stands her where the clearance says when no ground has a way out", () => {
    // A wall three tiles in from every edge, the drop zone inside it:
    // nowhere the squad can reach touches an edge.
    const map = ring(
      fieldMap(40, 40).deploy(
        [5, 6, 7].flatMap((x) => [5, 6, 7].map((z) => at(x, z))),
      ),
      3,
      36,
    ).build();
    const setUp = ALPHA_HUNT_SETUP.setup(
      missionWith(map, [unitAt("squad-1", "infantry", at(5, 5))]),
      map,
      huntFor(),
      setupDeps(),
    );
    expect(setUp.ok).toBe(true);
    if (!setUp.ok) return;
    const mother = motherOn(setUp.value);
    expect(mother.pos).toEqual(broodmotherLair(map, [], 3)[0]);
    expect(hasWayOut(setUp.value, mother)).toBe(false);
  });
});

describe("broodmotherLair", () => {
  it("ranks clear of edges and deploy first, then clear of edges, then the rest", () => {
    // A drop zone in the middle of a 40×40 field, so all three tiers stand.
    const drop = at(20, 20);
    const map = fieldMap(40, 40).deploy([drop]).build();
    const lair = broodmotherLair(map, [], 3);
    const tierOf = (anchor: TileCoord): number => {
      const edges = edgeDistance(anchor, map) >= BROODMOTHER_LAIR_CLEARANCE;
      const deploy = footprintTiles(anchor, 3).every(
        (tile) => manhattanDistance(tile, drop) >= BROODMOTHER_LAIR_CLEARANCE,
      );
      return edges ? (deploy ? 0 : 1) : 2;
    };
    const tiers = lair.map(tierOf);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(new Set(tiers)).toEqual(new Set([0, 1, 2]));
    // Within a tier, the block's centre nearest the map's goes first.
    const centreDistance = (anchor: TileCoord): number =>
      manhattanDistance(at(anchor.x + 1, anchor.z + 1), drop);
    const tierZero = lair.filter((anchor) => tierOf(anchor) === 0);
    expect(tierZero.map(centreDistance)).toEqual(
      tierZero.map(centreDistance).sort((a, b) => a - b),
    );
  });

  it("puts her in the middle of an open map", () => {
    expect(broodmotherLair(huntField(), [], 3)[0]).toEqual(at(19, 19));
  });

  it("keeps a cramped map playable rather than refusing it", () => {
    // 20 wide: nothing is 12 from every edge, so only the last tier is left.
    const map = fieldMap(20, 20)
      .deploy([at(0, 0)])
      .build();
    const lair = broodmotherLair(map, [], 3);
    expect(lair.length).toBeGreaterThan(0);
    expect(lair[0]).toEqual(at(9, 9));
    // Short of the clearance, the deeper in from the edges the better.
    const depths = lair.map((anchor) => edgeDistance(anchor, map));
    expect(depths).toEqual([...depths].sort((a, b) => b - a));
  });

  it("never covers a deploy or an extraction tile", () => {
    const map = huntField();
    const extraction = [at(20, 20)];
    const lair = broodmotherLair(map, extraction, 3);
    for (const anchor of lair) {
      const block = footprintTiles(anchor, 3);
      expect(block).not.toContainEqual(at(20, 20));
      expect(block).not.toContainEqual(at(1, 1));
    }
  });
});

// ===========================================
// Through the mission start, over seeds, biomes and sizes
// ===========================================

describe("an Alpha Hunt started from the campaign", () => {
  const PARTS = new StaticPartCatalogue(STARTER_PARTS);

  /** The mission start's shipped deps, the Broodmother among the species. */
  function startDeps(): MissionStartDeps {
    return {
      missionTypes: MISSION_TYPES,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      sheetFor: (mech) => {
        const sheet = validateLoadout(
          mech.loadout,
          PARTS,
          MECH_RATING_TUNING,
          UPGRADE_TUNING,
        );
        return sheet.ok ? sheet.value : undefined;
      },
      unitTuning: UNIT_TUNING,
      spawnTuning: SPAWN_TUNING,
      garrison: GARRISON_TUNING,
      generator: GENERATOR_TUNING,
      civilian: CIVILIAN_TUNING,
      hiveGuard: BUG_SPECIES["hive-guard"],
      hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
      ids: new SequentialIdGenerator(),
      registries: createDefaultRegistries(),
      species: Object.values(BUG_SPECIES),
    };
  }

  /** A new campaign with `offer` on the board, started with the whole roster. */
  function started(offer: Mission): TacticalState {
    const base = createNewGame(
      { seed: 11, createdAt: "2026-09-26T00:00:00.000Z" },
      {
        map: EARTH_MAP,
        squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
        starterRoster: STARTER_ROSTER,
        newGameTuning: NEW_GAME_TUNING,
        threatTuning: THREAT_TUNING,
        economyTuning: ECONOMY_TUNING,
      },
    );
    const state: GameState = {
      ...base,
      overworld: { ...base.overworld, missions: [offer] },
    };
    const result = startTacticalMission(
      state,
      offer.id,
      {
        missionId: offer.id,
        squadIds: base.roster.squads.map((squad) => squad.id),
        mechIds: base.roster.mechs.map((mech) => mech.id),
      },
      startDeps(),
    );
    if (!result.ok || result.value.activeMission === undefined) {
      throw new Error(`the hunt ${offer.mapParams.seed} did not start`);
    }
    return result.value.activeMission;
  }

  const SIZES: readonly MapSizeId[] = ["small", "medium", "large"];
  const CASES = [0, 1, 2, 3, 4, 5].flatMap((index) =>
    SIZES.map((size, sizeIndex) => ({
      size,
      biome: BIOME_IDS[(index * SIZES.length + sizeIndex) % BIOME_IDS.length]!,
      seed: `alpha-hunt-${String(index)}`,
    })),
  );

  it.each(CASES)(
    "stands her $size/$biome/$seed at least the clearance from every edge and from deploy",
    ({ size, biome, seed }) => {
      const mission = started(
        huntFor({ size, biome, seed, scars: 1, name: "Grey Widow" }),
      );
      const mother = motherOn(mission);
      expect(edgeDistance(mother.pos, mission.map)).toBeGreaterThanOrEqual(
        BROODMOTHER_LAIR_CLEARANCE,
      );
      expect(deployDistance(mission, mother.pos)).toBeGreaterThanOrEqual(
        BROODMOTHER_LAIR_CLEARANCE,
      );
      // And her block can walk to an edge: the hunt can be lost.
      expect(hasWayOut(mission, mother)).toBe(true);
      expect(mother.name).toBe("Grey Widow");
      expect(mother.hp).toBe(broodmotherHp(3, 1));
      expect(
        mission.objectives.filter(
          (objective) => objective.kind === "kill-broodmother",
        ),
      ).toEqual([
        expect.objectContaining({ targetId: mother.id, complete: false }),
      ]);
      // Her nests stand too; that they are fewer than a clearance's is
      // the mission type's requirement (mission-types.test.ts).
      expect(mission.spawners.length).toBeGreaterThanOrEqual(1);
    },
  );
});

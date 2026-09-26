import { STOREY_LAYERS } from "../../core/model/elevation";
import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { CoverLevel } from "../../mapgen/model/cover";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { attack } from "../model/attack-command";
import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import { MISSION_ENDED } from "../model/mission-ended-event";
import { OBJECTIVE_UPDATED } from "../model/objective-updated-event";
import { SPAWNER_DAMAGED } from "../model/spawner-damaged-event";
import type { CombatTuning } from "../model/combat-tuning";
import type { TacticalContext } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { TURRET_TUNING } from "../data/turret-tuning";
import { CIVILIANS_KILLED } from "../model/civilians-killed-event";
import { TURRET_DESTROYED } from "../model/turret-destroyed-event";
import { UNIT_DIED } from "../model/unit-died-event";
import { armTurret } from "./turret-service";
import { bugUnit, mechUnit, turretUnit } from "./unit-factory";
import type { UnitTemplate } from "../model/unit-template";
import type { WeaponProfile } from "../model/weapon-profile";
import { DEFAULT_WEAPON_NAME, PRIMARY_WEAPON_ID } from "../model/unit-weapon";
import {
  blockUnitAt,
  burrowerAt,
  ctxWith,
  fixtureAttackDeps,
  missionWith,
  openField,
  riggedRng,
  unitAt,
  withCivilian,
} from "./tactical-fixtures.test-helper";
import { attackTile } from "../model/attack-command";
import { BLAST_RESOLVED } from "../model/blast-resolved-event";
import { EFFECT_STARTED } from "../model/effect-started-event";
import { STRUCTURE_DESTROYED } from "../model/structure-destroyed-event";
import { PassMask } from "../../mapgen/model/pass-mask";
import { TileIndex } from "../../mapgen/service/tile-index";
import { previewTileAttack, tileWeaponOptions } from "./combat-service";
import { emptyVision } from "./vision-service";
import { SPITTER } from "../../bugs/data/species";
import { ACID_RESISTANT_PLATING } from "../../roster/data/autopsy-parts";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { createMech } from "../../roster/service/mech-factory";
import { UNIT_TUNING } from "../data/unit-tuning";
import type { UnitBuild } from "./unit-factory";
import {
  attackEndsTurn,
  attackTerrain,
  attacksRemaining,
  createAttackHandler,
  damageRange,
  hitChance,
  previewAttack,
  resolveAttack,
  validateTargeting,
} from "./combat-service";

// ===========================================
// Fixtures
// ===========================================

const T = COMBAT_TUNING;
const DEPS = fixtureAttackDeps();
const RIFLE: WeaponProfile = {
  range: 8,
  accuracy: 65,
  damage: 10,
  armorPen: 0,
};
const NO_TERRAIN = {
  distance: 1,
  cover: CoverLevel.NONE,
  flanked: false,
  elevation: 0,
} as const;

/**
 * 10×6, two levels: open ground, a crate at (4,0,2) giving low cover to
 * its neighbours, a solid wall on the west of (7,0,3), and a ledge tile
 * at (9,1,0).
 */
function fixtureMap(): TacticalMap {
  const b = new FixtureMapBuilder(10, 6, 2 * STOREY_LAYERS).fillGround();
  b.prop(PropKindIds.CRATE, { x: 4, y: 0, z: 2 });
  b.wall({ x: 7, y: 0, z: 3 }, "w", "solid");
  b.tile({ x: 9, y: STOREY_LAYERS, z: 0 }, SurfaceIds.ROCK);
  return b.build();
}

function template(id: string, weapon: WeaponProfile, armor = 0): UnitTemplate {
  return {
    id,
    name: id,
    maxHp: 20,
    maxAp: 2,
    move: 5,
    weapons: [
      { id: PRIMARY_WEAPON_ID, name: DEFAULT_WEAPON_NAME, profile: weapon },
    ],
    sightRange: 12,
    armor,
    passClass: "infantry",
    modelId: "tdf.infantry.rifle",
  };
}

function unit(
  id: string,
  team: "tdf" | "bugs",
  templateId: string,
  x: number,
  z: number,
  overrides: Partial<Unit> = {},
): Unit {
  return {
    id,
    kind: team === "tdf" ? "squad" : "bug",
    team,
    sourceId: id,
    templateId,
    pos: { x, y: 0, z },
    facing: "n",
    hp: 20,
    maxHp: 20,
    ap: 2,
    maxAp: 2,
    status: [],
    passClass: "infantry",
    ...overrides,
  };
}

const TEMPLATES: Record<string, UnitTemplate> = {
  rifle: template("rifle", RIFLE),
  armoured: template(
    "armoured",
    { range: 1, accuracy: 60, damage: 3, armorPen: 0 },
    4,
  ),
  swarmer: template("swarmer", {
    range: 1,
    accuracy: 60,
    damage: 3,
    armorPen: 0,
  }),
};

/** A mission in the player phase with the given units. */
function mission(
  units: Unit[],
  overrides: Partial<TacticalState> = {},
): TacticalState {
  return {
    missionId: "mission-1",
    seed: 1,
    map: fixtureMap(),
    effects: [],
    carcasses: [],
    units,
    templates: TEMPLATES,
    difficulty: 1,
    threat: 0,
    turn: 1,
    phase: "player",
    objectives: [],
    spawners: [],
    edgeSpawn: { nextTurn: 3, wave: 0 },
    extracted: [],
    vision: emptyVision(),
    extraction: [],
    log: [],
    radars: [],
    charges: [],
    commandSeq: 0,
    ...overrides,
  };
}

function ctx(seed: number): TacticalContext {
  return { rng: new Mulberry32Rng(seed), ids: new SequentialIdGenerator() };
}

// ===========================================
// Formulae
// ===========================================

describe("hitChance", () => {
  it("is the weapon's accuracy point-blank on open ground", () => {
    expect(hitChance(RIFLE, NO_TERRAIN, T)).toBe(65);
  });

  it("loses accuracy per tile beyond the first", () => {
    expect(hitChance(RIFLE, { ...NO_TERRAIN, distance: 5 }, T)).toBe(
      65 - 4 * T.rangePenaltyPerTile,
    );
  });

  it("subtracts cover, adds a flank bonus and a capped elevation modifier", () => {
    expect(hitChance(RIFLE, { ...NO_TERRAIN, cover: CoverLevel.LOW }, T)).toBe(
      65 + T.coverModifier[1],
    );
    expect(hitChance(RIFLE, { ...NO_TERRAIN, cover: CoverLevel.HIGH }, T)).toBe(
      65 + T.coverModifier[2],
    );
    expect(hitChance(RIFLE, { ...NO_TERRAIN, flanked: true }, T)).toBe(
      65 + T.flankBonus,
    );
    expect(hitChance(RIFLE, { ...NO_TERRAIN, elevation: 1 }, T)).toBe(
      65 + T.elevationPerStorey,
    );
    expect(hitChance(RIFLE, { ...NO_TERRAIN, elevation: -1 }, T)).toBe(
      65 - T.elevationPerStorey,
    );
    expect(hitChance(RIFLE, { ...NO_TERRAIN, elevation: 5 }, T)).toBe(
      65 + T.maxElevationModifier,
    );
  });

  it("clamps into the tuning's band", () => {
    expect(hitChance({ ...RIFLE, accuracy: 100 }, NO_TERRAIN, T)).toBe(
      T.maxHitChance,
    );
    expect(
      hitChance(
        { ...RIFLE, accuracy: 0 },
        { ...NO_TERRAIN, cover: CoverLevel.HIGH },
        T,
      ),
    ).toBe(T.minHitChance);
  });
});

describe("damageRange", () => {
  it("spreads around the weapon's damage and subtracts unpenetrated armor", () => {
    expect(damageRange(RIFLE, 0, T)).toEqual([8, 13]);
    expect(damageRange(RIFLE, 4, T)).toEqual([4, 9]);
    expect(damageRange({ ...RIFLE, armorPen: 3 }, 4, T)).toEqual([7, 12]);
    expect(damageRange({ ...RIFLE, damage: 2 }, 10, T)).toEqual([
      T.minDamage,
      T.minDamage,
    ]);
  });
});

// ===========================================
// Terrain
// ===========================================

describe("attackTerrain", () => {
  const map = fixtureMap();

  it("measures distance and elevation on open ground", () => {
    const terrain = attackTerrain(
      map,
      { x: 1, y: 0, z: 1 },
      { x: 4, y: 0, z: 5 },
    );
    expect(terrain).toEqual({
      distance: 7,
      cover: CoverLevel.NONE,
      flanked: false,
      elevation: 0,
    });
    expect(
      attackTerrain(map, { x: 9, y: STOREY_LAYERS, z: 0 }, { x: 5, y: 0, z: 0 })
        .elevation,
    ).toBe(1);
  });

  it("measures distance in three dimensions, so a storey of height counts (#1119)", () => {
    // Same column, one storey up: 1.5 tiles of height alone.
    expect(
      attackTerrain(map, { x: 1, y: STOREY_LAYERS, z: 1 }, { x: 1, y: 0, z: 1 })
        .distance,
    ).toBe(2);
    // Two storeys up and seven across: hypot(7, 3) = 7.6, rounded to 8.
    expect(
      attackTerrain(
        map,
        { x: 1, y: 2 * STOREY_LAYERS, z: 1 },
        { x: 4, y: 0, z: 5 },
      ).distance,
    ).toBe(8);
    // Height counts the same way up as down.
    expect(
      attackTerrain(
        map,
        { x: 4, y: 0, z: 5 },
        { x: 1, y: 2 * STOREY_LAYERS, z: 1 },
      ).distance,
    ).toBe(8);
  });

  it("reads low cover from a crate and flanks around it", () => {
    // Target at (4,0,3): the crate sits north of it at (4,0,2).
    const covered = attackTerrain(
      map,
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 3 },
    );
    expect(covered.cover).toBe(CoverLevel.LOW);
    expect(covered.flanked).toBe(false);
    const flanking = attackTerrain(
      map,
      { x: 4, y: 0, z: 5 },
      { x: 4, y: 0, z: 3 },
    );
    expect(flanking.cover).toBe(CoverLevel.NONE);
    expect(flanking.flanked).toBe(true);
  });

  it("reads high cover from a solid wall", () => {
    const terrain = attackTerrain(
      map,
      { x: 2, y: 0, z: 3 },
      { x: 7, y: 0, z: 3 },
    );
    expect(terrain.cover).toBe(CoverLevel.HIGH);
  });
});

// ===========================================
// Preview and validation
// ===========================================

describe("previewAttack", () => {
  it("combines the formulae for a legal shot", () => {
    const m = mission([
      unit("s1", "tdf", "rifle", 1, 1),
      unit("b1", "bugs", "armoured", 3, 1),
    ]);
    const preview = previewAttack(m, "s1", "b1", T);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.value).toEqual({
      hitChance: 65 - T.rangePenaltyPerTile,
      damage: [4, 9],
      distance: 2,
      cover: CoverLevel.NONE,
      flanked: false,
      elevation: 0,
    });
  });

  it.each([
    ["unknown attacker", ["ghost", "b1"], {}, "unit-not-on-map"],
    ["unknown target", ["s1", "ghost"], {}, "unit-not-on-map"],
    ["dead attacker", ["dead", "b1"], {}, "unit-dead"],
    ["dead target", ["s1", "corpse"], {}, "unit-dead"],
    ["wrong phase", ["s1", "b1"], { phase: "bugs" }, "wrong-phase"],
    ["no action points", ["spent", "b1"], {}, "no-action-points"],
    ["self target", ["s1", "s1"], {}, "self-target"],
    ["friendly target", ["s1", "s2"], {}, "friendly-target"],
    ["out of range", ["b1", "s1"], { phase: "bugs" }, "out-of-range"],
    ["no line of sight", ["s1", "hidden"], {}, "no-line-of-sight"],
  ] as const)(
    "refuses %s",
    (_name, [attackerId, targetId], overrides, kind) => {
      const m = mission(
        [
          unit("s1", "tdf", "rifle", 1, 1),
          unit("s2", "tdf", "rifle", 2, 1),
          unit("dead", "tdf", "rifle", 1, 2, { hp: 0 }),
          unit("spent", "tdf", "rifle", 1, 3, { ap: 0 }),
          unit("b1", "bugs", "armoured", 3, 1),
          unit("corpse", "bugs", "swarmer", 3, 2, { hp: 0 }),
          // Behind the solid wall on the west edge of (7,0,3), shot from (5,0,3).
          unit("hidden", "bugs", "swarmer", 7, 3),
        ],
        overrides,
      );
      const shooter = m.units.map((u) =>
        u.id === "s1" && targetId === "hidden"
          ? { ...u, pos: { x: 5, y: 0, z: 3 } }
          : u,
      );
      const result = previewAttack(
        { ...m, units: shooter },
        attackerId,
        targetId,
        T,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe(kind);
    },
  );
});

// ===========================================
// Resolution
// ===========================================

describe("resolveAttack", () => {
  const base = () =>
    mission([
      unit("s1", "tdf", "rifle", 1, 1),
      unit("b1", "bugs", "swarmer", 2, 1, { hp: 6, maxHp: 6 }),
    ]);

  it("is deterministic per seed and only ever hits or misses as the preview says", () => {
    const m = base();
    const a = resolveAttack(m, attack("s1", "b1"), ctx(3), T, DEPS);
    const b = resolveAttack(m, attack("s1", "b1"), ctx(3), T, DEPS);
    expect(b).toEqual(a);
    let hits = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const result = resolveAttack(m, attack("s1", "b1"), ctx(seed), T, DEPS);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const resolved = result.value.events[0];
      expect(resolved?.type).toBe(ATTACK_RESOLVED);
      if (resolved?.type !== ATTACK_RESOLVED) continue;
      if (resolved.payload.hit) {
        hits++;
        expect(resolved.payload.damage).toBeGreaterThanOrEqual(8);
        expect(resolved.payload.damage).toBeLessThanOrEqual(13);
      } else {
        expect(resolved.payload.damage).toBe(0);
      }
    }
    expect(hits).toBeGreaterThan(80);
    expect(hits).toBeLessThan(180);
  });

  // The presentation layer picks the shot or the claw from this field, so
  // it has to be the firing weapon's reach and not the distance covered
  // (#457). Both weapons fire over one tile here: the geometry is
  // identical and only the profile differs.
  it("names the firing weapon's reach on the event, not the distance covered", () => {
    for (const [templateId, range] of [
      ["rifle", 8],
      ["swarmer", 1],
    ] as const) {
      const m = mission([
        unit("s1", "tdf", templateId, 1, 1),
        unit("b1", "bugs", "swarmer", 2, 1, { hp: 6, maxHp: 6 }),
      ]);
      const result = resolveAttack(m, attack("s1", "b1"), ctx(3), T, DEPS);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const resolved = result.value.events[0];
      expect(resolved?.type).toBe(ATTACK_RESOLVED);
      if (resolved?.type !== ATTACK_RESOLVED) continue;
      expect(resolved.payload.weaponRange).toBe(range);
    }
  });

  it("applies damage and kills at zero with the killer named, leaving a squad its second action", () => {
    const m = base();
    const hitSeed = [...Array(50).keys()]
      .map((i) => i + 1)
      .find((seed) => {
        const r = resolveAttack(m, attack("s1", "b1"), ctx(seed), T, DEPS);
        return (
          r.ok &&
          r.value.events[0]?.type === ATTACK_RESOLVED &&
          r.value.events[0].payload.hit
        );
      });
    expect(hitSeed).toBeDefined();
    const result = resolveAttack(
      m,
      attack("s1", "b1"),
      ctx(hitSeed ?? 1),
      T,
      DEPS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state, events } = result.value;
    const target = state.units.find((u) => u.id === "b1");
    const attacker = state.units.find((u) => u.id === "s1");
    expect(target?.hp).toBe(0);
    // A squad's attack costs an action rather than the whole turn, so it
    // still has one left to fire again (#533).
    expect(attacker?.ap).toBe(1);
    expect(events.map((e) => e.type)).toEqual([ATTACK_RESOLVED, UNIT_DIED]);
    expect(events[1]?.payload).toEqual({ unitId: "b1", killerId: "s1" });
    expect(state.units).toHaveLength(2);
    expect(m.units[1]?.hp).toBe(6);
  });

  it("ends a turret with a TurretDestroyed naming the killer, never a UnitDied (#1155)", () => {
    const built = turretUnit(
      TURRET_TUNING,
      "tdf",
      { pos: { x: 3, y: 0, z: 0 }, facing: "e" },
      new SequentialIdGenerator(),
    );
    const turret = { ...armTurret(built.unit, TURRET_TUNING), hp: 1 };
    const base = missionWith(
      openField().build(),
      [
        unitAt("b1", "infantry", { x: 4, y: 0, z: 0 }, { team: "bugs" }),
        turret,
      ],
      { phase: "bugs" },
    );
    const m = {
      ...base,
      templates: { ...base.templates, [built.template.id]: built.template },
    };
    const result = resolveAttack(
      m,
      attack("b1", turret.id),
      ctxWith(riggedRng(true, "high")),
      T,
      DEPS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state, events } = result.value;
    expect(state.units.find((u) => u.id === turret.id)?.hp).toBe(0);
    expect(events.map((e) => e.type)).toEqual([
      ATTACK_RESOLVED,
      TURRET_DESTROYED,
    ]);
    expect(events[1]?.payload).toEqual({
      turretId: turret.id,
      pos: { x: 3, y: 0, z: 0 },
      killerId: "b1",
    });
    expect(events.some((e) => e.type === UNIT_DIED)).toBe(false);
  });

  it("ends a civilian group a bug bites down with CiviliansKilled, never a UnitDied (campaign arc §6.4)", () => {
    for (const trapped of [true, false]) {
      const m = withCivilian(
        missionWith(
          openField().build(),
          [unitAt("b1", "infantry", { x: 4, y: 0, z: 0 }, { team: "bugs" })],
          { phase: "bugs" },
        ),
        "civ-1",
        { x: 3, y: 0, z: 0 },
        { trapped, hp: 1 },
      );
      const result = resolveAttack(
        m,
        attack("b1", "civ-1"),
        ctxWith(riggedRng(true, "high")),
        T,
        DEPS,
      );
      if (!result.ok) throw new Error(`refused: ${result.error.kind}`);
      const { state, events } = result.value;
      expect(state.units.find((u) => u.id === "civ-1")?.hp).toBe(0);
      expect(events.map((e) => e.type)).toEqual([
        ATTACK_RESOLVED,
        CIVILIANS_KILLED,
      ]);
      expect(events[1]?.payload).toEqual({
        unitId: "civ-1",
        pos: { x: 3, y: 0, z: 0 },
        killerId: "b1",
      });
    }
  });

  it("spends only the attack cost when attacks do not end the turn, and a miss changes no hit points", () => {
    const tuning: CombatTuning = {
      ...T,
      attackEndsTurn: {
        squad: false,
        mech: false,
        bug: false,
        turret: false,
        generator: false,
        civilian: false,
      },
      maxHitChance: 5,
      minHitChance: 5,
    };
    const m = base();
    const result = resolveAttack(m, attack("s1", "b1"), ctx(2), tuning, DEPS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const attacker = result.value.state.units.find((u) => u.id === "s1");
    expect(attacker?.ap).toBe(1);
    const missed = [...Array(30).keys()].some((seed) => {
      const r = resolveAttack(
        m,
        attack("s1", "b1"),
        ctx(seed + 1),
        tuning,
        DEPS,
      );
      if (!r.ok) return false;
      const ev = r.value.events[0];
      return (
        ev?.type === ATTACK_RESOLVED &&
        !ev.payload.hit &&
        r.value.state.units[1]?.hp === 6
      );
    });
    expect(missed).toBe(true);
  });

  it("spends a charge per shot and refuses at zero, leaving bugs unlimited", () => {
    // The template declares the pool; the unit carries what is left of
    // it, per weapon since #532.
    const armed = {
      ...TEMPLATES,
      rifle: {
        ...TEMPLATES.rifle!,
        weapons: [{ ...TEMPLATES.rifle!.weapons[0]!, charges: 1 }],
      },
    };
    const m = {
      ...mission([
        unit("s1", "tdf", "rifle", 1, 1, {
          charges: { [PRIMARY_WEAPON_ID]: 1 },
        }),
        unit("b1", "bugs", "swarmer", 2, 1, { hp: 60, maxHp: 60 }),
      ]),
      templates: armed,
    };
    const first = resolveAttack(
      m,
      attack("s1", "b1"),
      ctx(1),
      {
        ...T,
        attackEndsTurn: {
          squad: false,
          mech: false,
          bug: false,
          turret: false,
          generator: false,
          civilian: false,
        },
      },
      DEPS,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.state.units[0]?.charges).toEqual({
      [PRIMARY_WEAPON_ID]: 0,
    });
    expect(first.value.state.units[1]?.charges).toBeUndefined();
    const second = previewAttack(first.value.state, "s1", "b1", T);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe("no-charges");
    const bugShot = previewAttack({ ...m, phase: "bugs" }, "b1", "s1", T);
    expect(bugShot.ok).toBe(true);
  });

  it("returns the error and leaves the mission untouched for an illegal attack", () => {
    const m = base();
    const before = JSON.parse(JSON.stringify(m)) as TacticalState;
    const result = createAttackHandler(T, DEPS)(m, attack("b1", "s1"), ctx(1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("wrong-phase");
    expect(m).toEqual(before);
  });
});

// ===========================================
// Egg spawners as targets (#426)
// ===========================================

describe("attacking an egg spawner", () => {
  const SPAWNER_POS = { x: 5, y: 0, z: 0 };

  /** A spawner at `pos` with `hp` left, and the objective tracking it. */
  function withSpawner(
    units: Unit[],
    options: {
      hp?: number;
      destroyed?: boolean;
      pos?: { x: number; y: number; z: number };
      objectives?: TacticalState["objectives"];
    } = {},
  ): TacticalState {
    return mission(units, {
      spawners: [
        {
          id: "spawner-1",
          pos: options.pos ?? SPAWNER_POS,
          hatchRadius: 3,
          hp: options.hp ?? 20,
          timer: 2,
          destroyed: options.destroyed ?? false,
        },
      ],
      objectives: options.objectives ?? [
        {
          id: "objective-1",
          kind: "destroy-spawner",
          targetId: "spawner-1",
          complete: false,
        },
      ],
    });
  }

  /** A context whose dice always hit for the low end of the band. */
  function riggedCtx(): TacticalContext {
    return {
      rng: {
        next: () => 0,
        nextInt: (min: number) => min,
        pick: (items: readonly unknown[]) => items[0],
        chance: () => true,
        pickWeighted: (items: readonly unknown[]) => items[0],
        shuffle: (items: readonly unknown[]) => [...items],
        fork: function () {
          return this;
        },
        getState: () => ({ algorithm: "rigged", seed: 0, state: 0 }),
      } as unknown as TacticalContext["rng"],
      ids: new SequentialIdGenerator(),
    };
  }

  it("previews a shot at a spawner with the same numbers a unit gets", () => {
    const m = withSpawner([unit("s1", "tdf", "rifle", 0, 0)]);
    const preview = previewAttack(m, "s1", "spawner-1", T);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    // Range, cover and elevation are judged against the spawner's tile.
    expect(preview.value.distance).toBe(5);
    expect(preview.value.cover).toBe(CoverLevel.NONE);
    // A spawner is unarmoured, so the band is the rifle's own.
    expect(preview.value.damage).toEqual(damageRange(RIFLE, 0, T));
    expect(preview.value.hitChance).toBe(
      hitChance(RIFLE, { ...NO_TERRAIN, distance: 5 }, T),
    );
  });

  it("takes hit points off the spawner and announces the damage", () => {
    const m = withSpawner([unit("s1", "tdf", "rifle", 0, 0)]);
    const applied = resolveAttack(
      m,
      attack("s1", "spawner-1"),
      riggedCtx(),
      T,
      DEPS,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const [low] = damageRange(RIFLE, 0, T);
    expect(applied.value.state.spawners[0]).toMatchObject({
      hp: 20 - low,
      destroyed: false,
    });
    expect(applied.value.events.map((e) => e.type)).toEqual([
      ATTACK_RESOLVED,
      SPAWNER_DAMAGED,
    ]);
    // The attacker paid for the shot exactly as it would against a unit:
    // one action for a squad, not the whole turn (#533).
    expect(applied.value.state.units[0]?.ap).toBe(1);
    // Nothing is written into units for a spawner.
    expect(applied.value.state.units).toHaveLength(1);
  });

  it("destroying the last spawner completes its objective; the force still has to extract", () => {
    const [low] = damageRange(RIFLE, 0, T);
    const m = withSpawner([unit("s1", "tdf", "rifle", 0, 0)], { hp: low });
    const applied = resolveAttack(
      m,
      attack("s1", "spawner-1"),
      riggedCtx(),
      T,
      DEPS,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.state.spawners[0]).toMatchObject({
      hp: 0,
      destroyed: true,
    });
    expect(applied.value.state.objectives[0]?.complete).toBe(true);
    // Not over: the squad is still on the map, and the mission ends when
    // it boards the drop ship (the Executive Director's rule on #1113).
    expect(applied.value.state.outcome).toBeUndefined();
    expect(applied.value.events.map((e) => e.type)).toEqual([
      ATTACK_RESOLVED,
      SPAWNER_DAMAGED,
      OBJECTIVE_UPDATED,
    ]);
  });

  it("leaves the mission running while another objective is still open", () => {
    const [low] = damageRange(RIFLE, 0, T);
    const m = withSpawner([unit("s1", "tdf", "rifle", 0, 0)], {
      hp: low,
      objectives: [
        {
          id: "objective-1",
          kind: "destroy-spawner",
          targetId: "spawner-1",
          complete: false,
        },
        {
          id: "objective-2",
          kind: "destroy-spawner",
          targetId: "spawner-2",
          complete: false,
        },
      ],
    });
    const applied = resolveAttack(
      m,
      attack("s1", "spawner-1"),
      riggedCtx(),
      T,
      DEPS,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.state.outcome).toBeUndefined();
    expect(applied.value.events).not.toContainEqual(
      expect.objectContaining({ type: MISSION_ENDED }),
    );
  });

  it("a miss leaves the spawner untouched and says nothing about it", () => {
    const m = withSpawner([unit("s1", "tdf", "rifle", 0, 0)]);
    const missed = resolveAttack(
      m,
      attack("s1", "spawner-1"),
      { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() },
      { ...T, minHitChance: 0, maxHitChance: 0 },
      DEPS,
    );
    expect(missed.ok).toBe(true);
    if (!missed.ok) return;
    expect(missed.value.state.spawners[0]?.hp).toBe(20);
    expect(missed.value.events.map((e) => e.type)).toEqual([ATTACK_RESOLVED]);
  });

  it("refuses a bug shooting its own hive, whatever the phase", () => {
    const m = {
      ...withSpawner([unit("b1", "bugs", "swarmer", 4, 0)]),
      phase: "bugs" as const,
    };
    const refused = previewAttack(m, "b1", "spawner-1", T);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toEqual({
      kind: "friendly-target",
      targetId: "spawner-1",
    });
  });

  it("refuses a spawner that is already destroyed", () => {
    const m = withSpawner([unit("s1", "tdf", "rifle", 0, 0)], {
      hp: 0,
      destroyed: true,
    });
    const refused = previewAttack(m, "s1", "spawner-1", T);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toEqual({
      kind: "target-destroyed",
      targetId: "spawner-1",
    });
  });

  it("judges range and line of sight from the spawner's own tile", () => {
    const far = withSpawner([unit("s1", "tdf", "rifle", 0, 0)], {
      pos: { x: 9, y: 0, z: 5 },
    });
    const outOfRange = previewAttack(far, "s1", "spawner-1", T);
    expect(outOfRange.ok).toBe(false);
    if (!outOfRange.ok) {
      expect(outOfRange.error.kind).toBe("out-of-range");
    }
    // The fixture map walls the west side of (7,0,3).
    const walled = withSpawner([unit("s1", "tdf", "rifle", 5, 3)], {
      pos: { x: 7, y: 0, z: 3 },
    });
    const blocked = previewAttack(walled, "s1", "spawner-1", T);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toEqual({
        kind: "no-line-of-sight",
        targetId: "spawner-1",
      });
    }
  });
});

// ===========================================
// Melee and cover (#446)
// ===========================================

describe("a melee attacker and cover", () => {
  /** The crate at (4,0,2) gives its neighbours low cover against a shot. */
  const DEFENDER = { x: 4, z: 3 } as const;

  /** A mission with a defender beside the crate and a melee bug at `from`. */
  function beside(from: { x: number; z: number }): TacticalState {
    return mission([
      unit("s1", "tdf", "rifle", DEFENDER.x, DEFENDER.z),
      unit("b1", "bugs", "swarmer", from.x, from.z, { ap: 2 }),
    ]);
  }

  /** Preview of the bug biting the defender from `from`, in the bugs' phase. */
  function biteFrom(from: { x: number; z: number }) {
    const m = { ...beside(from), phase: "bugs" as const };
    const preview = previewAttack(m, "b1", "s1", T);
    expect(preview.ok, `bite from ${from.x},${from.z}`).toBe(true);
    return preview.ok ? preview.value : undefined;
  }

  it("never flanks and never mitigates, so the boulder changes nothing (#446)", () => {
    // The four tiles around the defender; (4,0,2) is the crate itself and
    // cannot be stood on, so the three standable sides are these.
    const sides = [
      { x: 3, z: 3 },
      { x: 5, z: 3 },
      { x: 4, z: 4 },
    ];
    const previews = sides.map((side) => biteFrom(side));
    for (const [i, preview] of previews.entries()) {
      const where = `${String(sides[i]?.x)},${String(sides[i]?.z)}`;
      expect(preview?.flanked, `flanked from ${where}`).toBe(false);
      expect(preview?.cover, `cover from ${where}`).toBe(CoverLevel.NONE);
    }
    // Identical from every side: the crate neither helps nor hinders.
    const chances = previews.map((p) => p?.hitChance);
    expect(new Set(chances).size).toBe(1);
    // And it is the weapon's own accuracy, since a bite is always at
    // range 1 and this fixture is level ground: no range, cover, flank or
    // elevation term applies.
    expect(chances[0]).toBe(TEMPLATES.swarmer?.weapons[0]?.profile.accuracy);
  });

  it("the boulder does not raise the bite the way it used to", () => {
    // The defect: `flanked` was true from the sides the crate does not
    // cover, adding the flank bonus — standing beside cover *raised* a
    // swarmer's chance from 60 to 75.
    const withCrate = biteFrom({ x: 5, z: 3 })?.hitChance;
    // The same bite on open ground well away from the crate.
    const open = previewAttack(
      {
        ...mission([
          unit("s1", "tdf", "rifle", 1, 5),
          unit("b1", "bugs", "swarmer", 2, 5, { ap: 2 }),
        ]),
        phase: "bugs" as const,
      },
      "b1",
      "s1",
      T,
    );
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    expect(withCrate).toBe(open.value.hitChance);
  });

  it("leaves a ranged attacker's cover and flank exactly as they were", () => {
    // The rifle shooting the same defender still sees the crate.
    const m = mission([
      unit("s1", "tdf", "rifle", 4, 0),
      unit("b1", "bugs", "swarmer", DEFENDER.x, DEFENDER.z),
    ]);
    const shot = previewAttack(m, "s1", "b1", T);
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;
    expect(shot.value.cover).toBe(CoverLevel.LOW);
  });
});

// ===========================================
// Two attacks for infantry (#533)
// ===========================================

describe("attacks per turn by unit kind", () => {
  /** A squad and a bug in range of each other, both at full actions. */
  const pair = (attackerKind: "squad" | "mech") =>
    mission([
      unit("s1", "tdf", "rifle", 0, 0, { kind: attackerKind }),
      unit("b1", "bugs", "swarmer", 1, 0, { hp: 40, maxHp: 40 }),
    ]);

  /** Loaded dice, so a shot always connects and the budget is what varies. */
  const hit = (): TacticalContext => ctx(1);

  it("lets an infantry squad fire twice in one turn", () => {
    const first = resolveAttack(
      pair("squad"),
      attack("s1", "b1"),
      hit(),
      T,
      DEPS,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const after = first.value.state.units.find((u) => u.id === "s1");
    expect(after?.ap).toBe(1);

    // The second shot is legal and spends the last action.
    const second = resolveAttack(
      first.value.state,
      attack("s1", "b1"),
      hit(),
      T,
      DEPS,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.state.units.find((u) => u.id === "s1")?.ap).toBe(0);
  });

  it("refuses a squad's third attack, so two is the budget and not a special case", () => {
    let state = pair("squad");
    for (let fired = 0; fired < 2; fired++) {
      const applied = resolveAttack(state, attack("s1", "b1"), hit(), T, DEPS);
      expect(applied.ok).toBe(true);
      if (!applied.ok) return;
      state = applied.value.state;
    }
    const third = resolveAttack(state, attack("s1", "b1"), hit(), T, DEPS);
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.error.kind).toBe("no-action-points");
  });

  it("still ends a mech's turn on its one attack", () => {
    const applied = resolveAttack(
      pair("mech"),
      attack("s1", "b1"),
      hit(),
      T,
      DEPS,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.state.units.find((u) => u.id === "s1")?.ap).toBe(0);
    const again = resolveAttack(
      applied.value.state,
      attack("s1", "b1"),
      hit(),
      T,
      DEPS,
    );
    expect(again.ok).toBe(false);
  });

  it("still ends a bug's turn on its one attack", () => {
    const state = mission(
      [
        unit("b1", "bugs", "swarmer", 0, 0),
        unit("s1", "tdf", "rifle", 1, 0, { hp: 40, maxHp: 40 }),
      ],
      // A bug can only act in its own phase.
      { phase: "bugs" },
    );
    const applied = resolveAttack(state, attack("b1", "s1"), hit(), T, DEPS);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.state.units.find((u) => u.id === "b1")?.ap).toBe(0);
  });
});

// ===========================================
// The weapon overrides the kind (#1130)
// ===========================================

describe("attacks per turn by weapon", () => {
  /** A squad weapon that is one burst a turn: the radio squad's SMG. */
  const SMG: WeaponProfile = { ...RIFLE, range: 5, endsTurn: true };
  /** A weapon that grants a second shot to a kind that normally gets one. */
  const TWIN: WeaponProfile = { ...RIFLE, endsTurn: false };
  const templates: Record<string, UnitTemplate> = {
    ...TEMPLATES,
    smg: template("smg", SMG),
    twin: template("twin", TWIN),
  };
  const hit = (): TacticalContext => ctx(1);
  const board = (attacker: Unit): TacticalState =>
    mission(
      [attacker, unit("b1", "bugs", "swarmer", 1, 0, { hp: 40, maxHp: 40 })],
      {
        templates,
      },
    );

  it("ends a squad's turn on a weapon that says so, and refuses the second burst", () => {
    const first = resolveAttack(
      board(unit("s1", "tdf", "smg", 0, 0)),
      attack("s1", "b1"),
      hit(),
      T,
      DEPS,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // Both actions spent by one burst: a rifle squad would have one left.
    expect(first.value.state.units.find((u) => u.id === "s1")?.ap).toBe(0);
    const second = resolveAttack(
      first.value.state,
      attack("s1", "b1"),
      hit(),
      T,
      DEPS,
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe("no-action-points");
  });

  it("lets a mech fire twice on a weapon that does not end the turn", () => {
    const first = resolveAttack(
      board(unit("s1", "tdf", "twin", 0, 0, { kind: "mech" })),
      attack("s1", "b1"),
      hit(),
      T,
      DEPS,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.state.units.find((u) => u.id === "s1")?.ap).toBe(1);
  });

  it("reads the kind's rule when the weapon is silent", () => {
    expect(attackEndsTurn(RIFLE, "squad", T)).toBe(false);
    expect(attackEndsTurn(RIFLE, "mech", T)).toBe(true);
    expect(attackEndsTurn(SMG, "squad", T)).toBe(true);
    expect(attackEndsTurn(TWIN, "bug", T)).toBe(false);
  });

  it("counts the attacks left from the weapons carried", () => {
    const squad = { kind: "squad" as const, ap: 2 };
    expect(attacksRemaining(squad, templates.rifle!.weapons, T)).toBe(2);
    expect(attacksRemaining(squad, templates.smg!.weapons, T)).toBe(1);
    // Nothing carried: the kind's rule, as before #1130.
    expect(attacksRemaining(squad, [], T)).toBe(2);
    expect(attacksRemaining({ kind: "mech", ap: 2 }, [], T)).toBe(1);
    expect(
      attacksRemaining({ kind: "mech", ap: 2 }, templates.twin!.weapons, T),
    ).toBe(2);
    // Spent is spent, whatever the weapon says.
    expect(
      attacksRemaining({ kind: "squad", ap: 0 }, templates.rifle!.weapons, T),
    ).toBe(0);
  });
});

// ===========================================
// validateTargeting's own refusals (#735)
// ===========================================

/**
 * `previewAttack` and `validateTargeting` carry the same five refusals,
 * and only the preview's copies had ever run: the audit on #735 found
 * these five had never fired in any suite. They are the ones a real shot
 * and an overwatch reaction go through, so they are the copies that
 * matter.
 */
/**
 * The four refusals both entry points open with have one implementation
 * (#992). This is the test that would notice if they were ever written
 * out twice again: for the same bad input, the preview a player sees and
 * the validation a real shot goes through must answer the *same payload*,
 * not merely the same kind. Two copies drifting apart is exactly how
 * #735 found one of them had never run.
 */
describe("the refusals shared by preview and attack", () => {
  const board = () =>
    mission([
      unit("s1", "tdf", "rifle", 1, 1),
      unit("dead", "tdf", "rifle", 1, 2, { hp: 0 }),
      unit("b1", "bugs", "armoured", 3, 1),
      unit("corpse", "bugs", "swarmer", 3, 2, { hp: 0 }),
    ]);

  it.each([
    ["an attacker who is not on the map", "ghost", "b1"],
    ["a target who is not on the map", "s1", "ghost"],
    ["an attacker who is already dead", "dead", "b1"],
    ["a target who is already down", "s1", "corpse"],
  ] as const)("answers alike for %s", (_name, attackerId, targetId) => {
    const m = board();
    const preview = previewAttack(m, attackerId, targetId, T);
    const targeting = validateTargeting(m, attackerId, targetId, T);
    expect(preview.ok).toBe(false);
    expect(targeting.ok).toBe(false);
    if (preview.ok || targeting.ok) return;
    expect(preview.error).toEqual(targeting.error);
  });
});

describe("validateTargeting", () => {
  const pair = () =>
    mission([
      unit("s1", "tdf", "rifle", 1, 1),
      unit("b1", "bugs", "swarmer", 2, 1, { hp: 6, maxHp: 6 }),
    ]);

  it("refuses an attacker that is not on the map", () => {
    const result = validateTargeting(pair(), "ghost", "b1", T);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: "unit-not-on-map", unitId: "ghost" });
  });

  it("refuses a target that is not on the map", () => {
    const result = validateTargeting(pair(), "s1", "ghost", T);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: "unit-not-on-map", unitId: "ghost" });
  });

  it("refuses an attacker that is already dead", () => {
    const m = mission([
      unit("s1", "tdf", "rifle", 1, 1, { hp: 0 }),
      unit("b1", "bugs", "swarmer", 2, 1, { hp: 6, maxHp: 6 }),
    ]);
    const result = validateTargeting(m, "s1", "b1", T);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: "unit-dead", unitId: "s1" });
  });

  it("refuses a target that is already down", () => {
    const m = mission([
      unit("s1", "tdf", "rifle", 1, 1),
      unit("b1", "bugs", "swarmer", 2, 1, { hp: 0, maxHp: 6 }),
    ]);
    const result = validateTargeting(m, "s1", "b1", T);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: "unit-dead", unitId: "b1" });
  });

  it("refuses a weapon the attacker does not carry", () => {
    const result = validateTargeting(pair(), "s1", "b1", T, "no-such-weapon");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: "no-such-weapon", unitId: "s1" });
  });
});

// ===========================================
// Blast, demolition and fire (#1121)
// ===========================================

describe("weapons that mark the ground (#1121)", () => {
  const MORTAR: WeaponProfile = {
    range: 16,
    accuracy: 70,
    damage: 20,
    armorPen: 0,
    aoe: { radius: 1, falloff: 0.5 },
    demoForce: 2,
  };
  const FLAMER: WeaponProfile = {
    range: 3,
    accuracy: 80,
    damage: 12,
    armorPen: 0,
    aoe: { radius: 1, falloff: 0.5 },
    aoeEffect: { kind: "fire", chance: 1, falloff: 0 },
  };
  const CANNON: WeaponProfile = {
    range: 10,
    accuracy: 70,
    damage: 10,
    armorPen: 0,
    demoForce: 1,
  };
  const BREACHER: WeaponProfile = { ...CANNON, demoForce: 3 };
  const marked = {
    ...TEMPLATES,
    mortar: template("mortar", MORTAR),
    flamer: template("flamer", FLAMER),
    cannon: template("cannon", CANNON),
    breacher: template("breacher", BREACHER),
  };
  /** Loaded dice: every roll hits, every band rolls its low end. */
  const sure = (): TacticalContext => ({
    rng: riggedRng(true, "low"),
    ids: new SequentialIdGenerator(),
  });
  const wide = (): TacticalContext => ({
    rng: riggedRng(false),
    ids: new SequentialIdGenerator(),
  });
  const hpOf = (state: TacticalState, id: string): number | undefined =>
    state.units.find((u) => u.id === id)?.hp;

  it("splashes everything beside the target, both sides, less the shooter and the target, with falloff before armor", () => {
    const m = {
      ...mission([
        unit("s1", "tdf", "mortar", 0, 0),
        unit("b1", "bugs", "swarmer", 5, 0),
        unit("b2", "bugs", "swarmer", 5, 1),
        unit("ally", "tdf", "rifle", 6, 0),
        unit("plated", "bugs", "armoured", 4, 0),
        unit("far", "bugs", "swarmer", 7, 0),
      ]),
      templates: marked,
    };
    const applied = resolveAttack(m, attack("s1", "b1"), sure(), T, DEPS);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const { state, events } = applied.value;
    // Mortar 20 ± 25 % low end 15 on the target …
    expect(hpOf(state, "b1")).toBe(5);
    // … half strength (10, low end 8) on the neighbours, friend or foe …
    expect(hpOf(state, "b2")).toBe(12);
    expect(hpOf(state, "ally")).toBe(12);
    // … less the plate: 8 − 4 armor = 4.
    expect(hpOf(state, "plated")).toBe(16);
    // Out of the radius, and the shooter itself: untouched.
    expect(hpOf(state, "far")).toBe(20);
    expect(hpOf(state, "s1")).toBe(20);
    const blast = events.find((e) => e.type === BLAST_RESOLVED);
    expect(blast).toBeDefined();
    if (blast?.type !== BLAST_RESOLVED) return;
    expect(blast.payload).toMatchObject({
      attackerId: "s1",
      impact: { x: 5, y: 0, z: 0 },
      hit: true,
      radius: 1,
      aimedAtTile: false,
    });
    expect(blast.payload.victims.map((v) => v.targetId).sort()).toEqual(
      ["ally", "b2", "plated"].sort(),
    );
    // The aimed target's own line comes first and the blast follows it.
    expect(events.map((e) => e.type).slice(0, 2)).toEqual([
      ATTACK_RESOLVED,
      BLAST_RESOLVED,
    ]);
  });

  it("a miss at a unit applies nothing around it either", () => {
    const m = {
      ...mission([
        unit("s1", "tdf", "mortar", 0, 0),
        unit("b1", "bugs", "swarmer", 5, 0),
        unit("b2", "bugs", "swarmer", 5, 1),
      ]),
      templates: marked,
    };
    const applied = resolveAttack(m, attack("s1", "b1"), wide(), T, DEPS);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(hpOf(applied.value.state, "b2")).toBe(20);
    expect(applied.value.events.map((e) => e.type)).toEqual([ATTACK_RESOLVED]);
  });

  it("a plain weapon's shot is byte-for-byte what it was", () => {
    const m = mission([
      unit("s1", "tdf", "rifle", 0, 0),
      unit("b1", "bugs", "swarmer", 3, 0),
      unit("b2", "bugs", "swarmer", 3, 1),
    ]);
    const applied = resolveAttack(m, attack("s1", "b1"), sure(), T, DEPS);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.events.map((e) => e.type)).toEqual([ATTACK_RESOLVED]);
    expect(hpOf(applied.value.state, "b2")).toBe(20);
  });

  it("fires at an empty tile: the blast lands on whoever is beside it, and a miss costs the shot and nothing else", () => {
    const m = {
      ...mission([
        unit("s1", "tdf", "mortar", 0, 0),
        unit("b1", "bugs", "swarmer", 5, 1),
      ]),
      templates: marked,
    };
    const landed = resolveAttack(
      m,
      attackTile("s1", { x: 5, y: 0, z: 0 }),
      sure(),
      T,
      DEPS,
    );
    expect(landed.ok).toBe(true);
    if (!landed.ok) return;
    expect(hpOf(landed.value.state, "b1")).toBe(12);
    expect(landed.value.state.units[0]?.ap).toBe(1);
    expect(landed.value.events.map((e) => e.type)).toEqual([BLAST_RESOLVED]);
    if (landed.value.events[0]?.type !== BLAST_RESOLVED) return;
    expect(landed.value.events[0].payload).toMatchObject({
      hit: true,
      aimedAtTile: true,
    });
    expect(landed.value.events[0].payload.victims).toEqual([
      { targetId: "b1", kind: "unit", damage: 8, hp: 12 },
    ]);

    const wideOf = resolveAttack(
      m,
      attackTile("s1", { x: 5, y: 0, z: 0 }),
      wide(),
      T,
      DEPS,
    );
    expect(wideOf.ok).toBe(true);
    if (!wideOf.ok) return;
    expect(hpOf(wideOf.value.state, "b1")).toBe(20);
    expect(wideOf.value.state.units[0]?.ap).toBe(1);
    expect(wideOf.value.events).toEqual([
      {
        type: BLAST_RESOLVED,
        payload: {
          attackerId: "s1",
          impact: { x: 5, y: 0, z: 0 },
          hit: false,
          radius: 1,
          aimedAtTile: true,
          weaponRange: 16,
          victims: [],
        },
      },
    ]);
  });

  it("refuses a tile shot from a weapon that marks nothing, at a tile that is not there, out of range, or out of sight", () => {
    const m = {
      ...mission([
        unit("s1", "tdf", "rifle", 0, 0),
        unit("m1", "tdf", "mortar", 0, 1),
      ]),
      templates: marked,
    };
    const plain = resolveAttack(
      m,
      attackTile("s1", { x: 3, y: 0, z: 0 }),
      sure(),
      T,
      DEPS,
    );
    expect(plain.ok).toBe(false);
    if (!plain.ok) expect(plain.error.kind).toBe("no-area-weapon");
    const nowhere = resolveAttack(
      m,
      attackTile("m1", { x: 3, y: 5, z: 0 }),
      sure(),
      T,
      DEPS,
    );
    expect(nowhere.ok).toBe(false);
    if (!nowhere.ok) expect(nowhere.error.kind).toBe("no-such-tile");
    const far = resolveAttack(
      {
        ...m,
        templates: {
          ...marked,
          mortar: template("mortar", { ...MORTAR, range: 2 }),
        },
      },
      attackTile("m1", { x: 5, y: 0, z: 1 }),
      sure(),
      T,
      DEPS,
    );
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.error.kind).toBe("out-of-range");
    // (8,0,3) is behind the solid wall on the west of (7,0,3).
    const blind = resolveAttack(
      { ...m, units: [unit("m1", "tdf", "mortar", 5, 3)] },
      attackTile("m1", { x: 7, y: 0, z: 3 }),
      sure(),
      T,
      DEPS,
    );
    expect(blind.ok).toBe(false);
    if (!blind.ok) expect(blind.error.kind).toBe("tile-out-of-sight");
    const neither = resolveAttack(
      m,
      { type: "tactical:attack", payload: { attackerId: "m1" } },
      sure(),
      T,
      DEPS,
    );
    expect(neither.ok).toBe(false);
    if (!neither.ok) expect(neither.error.kind).toBe("no-aim");
  });

  it("brings down what its force can in the footprint, and the map it leaves is the one the next shot sees", () => {
    const m = {
      ...mission([unit("s1", "tdf", "cannon", 0, 2)]),
      templates: marked,
    };
    // The fixture's crate at (4,0,2) is a light prop: force 1 takes it.
    const before = new TileIndex(m.map).getAt({ x: 4, y: 0, z: 2 })!;
    expect(before.propId).toBeDefined();
    const applied = resolveAttack(
      m,
      attackTile("s1", { x: 4, y: 0, z: 2 }),
      sure(),
      T,
      DEPS,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const after = new TileIndex(applied.value.state.map).getAt({
      x: 4,
      y: 0,
      z: 2,
    })!;
    expect(after.propId).toBeUndefined();
    expect(after.pass).toBe(PassMask.ALL);
    expect(applied.value.state.map.props).toHaveLength(0);
    const fell = applied.value.events.filter(
      (e) => e.type === STRUCTURE_DESTROYED,
    );
    expect(fell).toHaveLength(1);
    expect(fell[0]).toMatchObject({
      payload: {
        unitId: "s1",
        tile: { x: 4, y: 0, z: 2 },
        structure: { kind: "prop" },
      },
    });
    // Force 2 cannot open the solid wall: aimed at the tile it stands
    // on, nothing falls — a mortar breaches a door, not masonry.
    const wall = resolveAttack(
      { ...m, units: [unit("s1", "tdf", "mortar", 6, 3)] },
      attackTile("s1", { x: 6, y: 0, z: 3 }),
      sure(),
      T,
      DEPS,
    );
    expect(wall.ok).toBe(true);
    if (!wall.ok) return;
    expect(wall.value.events.some((e) => e.type === STRUCTURE_DESTROYED)).toBe(
      false,
    );
    // Force 3 does.
    const breach = resolveAttack(
      { ...m, units: [unit("s1", "tdf", "breacher", 6, 3)] },
      attackTile("s1", { x: 6, y: 0, z: 3 }),
      sure(),
      T,
      DEPS,
    );
    expect(breach.ok).toBe(true);
    if (!breach.ok) return;
    expect(
      breach.value.events
        .filter((e) => e.type === STRUCTURE_DESTROYED)
        .map((e) =>
          e.type === STRUCTURE_DESTROYED ? e.payload.structure.kind : "",
        ),
    ).toEqual(["wall"]);
    expect(
      new TileIndex(breach.value.state.map).getAt({ x: 7, y: 0, z: 3 })!.walls,
    ).toEqual({});
  });

  it("leaves fire on the ground it reaches, after the blast and the demolition", () => {
    const m = {
      ...mission([
        unit("s1", "tdf", "flamer", 0, 0),
        unit("b1", "bugs", "swarmer", 2, 0),
      ]),
      templates: marked,
    };
    const applied = resolveAttack(m, attack("s1", "b1"), sure(), T, DEPS);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const { state, events } = applied.value;
    // Radius 1 around (2,0): five tiles minus none blocked, but the
    // shooter's own tile (0,0) is outside the radius, so it does not burn.
    const lit = state.effects
      .map((e) => `${String(e.tile.x)},${String(e.tile.z)}`)
      .sort();
    expect(lit).toEqual(["1,0", "2,0", "2,1", "3,0"].sort());
    expect(
      state.effects.every((e) => e.kind === "fire" && e.phasesLeft === 4),
    ).toBe(true);
    const order = events.map((e) => e.type);
    expect(order.indexOf(BLAST_RESOLVED)).toBeLessThan(
      order.indexOf(EFFECT_STARTED),
    );
    expect(events.filter((e) => e.type === EFFECT_STARTED)).toHaveLength(4);
    expect(state.effects.map((e) => e.id)).toEqual([
      "effect-1",
      "effect-2",
      "effect-3",
      "effect-4",
    ]);
  });

  it("previews the blast: the tiles, who else stands in them with their band, and what would fall", () => {
    const m = {
      ...mission([
        unit("s1", "tdf", "mortar", 0, 0),
        unit("b1", "bugs", "swarmer", 5, 0),
        unit("ally", "tdf", "rifle", 6, 0),
      ]),
      templates: marked,
    };
    const aimed = previewAttack(m, "s1", "b1", T, undefined, DEPS);
    expect(aimed.ok).toBe(true);
    if (!aimed.ok) return;
    expect(aimed.value.blast?.radius).toBe(1);
    expect(aimed.value.blast?.tiles[0]).toEqual({ x: 5, y: 0, z: 0 });
    expect(aimed.value.blast?.victims).toEqual([
      {
        id: "ally",
        kind: "unit",
        name: "rifle",
        team: "tdf",
        distance: 1,
        damage: [8, 13],
      },
    ]);
    expect(aimed.value.blast?.demolished).toBe(0);
    expect(aimed.value.blast?.leavesEffect).toBe(false);

    const ground = previewTileAttack(
      m,
      "s1",
      { x: 4, y: 0, z: 2 },
      T,
      undefined,
      DEPS,
    );
    expect(ground.ok).toBe(true);
    if (!ground.ok) return;
    // No body, no cover: the chance is accuracy less the range penalty.
    expect(ground.value.cover).toBe(CoverLevel.NONE);
    expect(ground.value.flanked).toBe(false);
    expect(ground.value.hitChance).toBe(70 - T.rangePenaltyPerTile * (6 - 1));
    expect(ground.value.blast?.demolished).toBe(1);
    // Without the content the count is unknown and says so, rather than zero.
    const blind = previewTileAttack(m, "s1", { x: 4, y: 0, z: 2 }, T);
    expect(blind.ok && blind.value.blast?.demolished).toBeUndefined();

    const plain = previewAttack(m, "ally", "b1", T);
    expect(plain.ok && plain.value.blast).toBeUndefined();
  });

  it("lists only the weapons that can fire at the ground", () => {
    const m = {
      ...mission([
        unit("s1", "tdf", "rifle", 0, 0),
        unit("m1", "tdf", "mortar", 0, 1),
      ]),
      templates: marked,
    };
    expect(tileWeaponOptions(m, "s1", T)).toEqual([]);
    expect(tileWeaponOptions(m, "m1", T).map((o) => o.weapon.id)).toEqual([
      PRIMARY_WEAPON_ID,
    ]);
  });

  it("ends the mission there and then when the blast, not the shot, takes the last spawner", () => {
    const m = {
      ...mission(
        [
          unit("s1", "tdf", "mortar", 0, 0),
          unit("b1", "bugs", "swarmer", 5, 0),
        ],
        {
          spawners: [
            {
              id: "spawner-1",
              pos: { x: 5, y: 0, z: 1 },
              hatchRadius: 1,
              hp: 5,
              timer: 3,
              destroyed: false,
            },
          ],
          objectives: [
            {
              id: "objective-1",
              kind: "destroy-spawner",
              targetId: "spawner-1",
              complete: false,
            },
          ],
          extracted: [unit("gone", "tdf", "rifle", 0, 0)],
        },
      ),
      templates: marked,
    };
    // The shooter is the last unit standing; once it is off the map the
    // completed objective would read as won. Here it still stands, so the
    // objective completes and the mission plays on — but the spawner's
    // destruction comes from the splash and is announced as such.
    const applied = resolveAttack(m, attack("s1", "b1"), sure(), T, DEPS);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.state.spawners[0]?.destroyed).toBe(true);
    expect(applied.value.state.objectives[0]?.complete).toBe(true);
    expect(applied.value.events.map((e) => e.type)).toContain(SPAWNER_DAMAGED);
    expect(applied.value.events.map((e) => e.type)).toContain(
      OBJECTIVE_UPDATED,
    );
  });
});

// ===========================================
// Footprints (#1130)
// ===========================================

describe("shots to and from a unit on a 2×2 block (#1130)", () => {
  const tile = (x: number, z: number): { x: number; y: number; z: number } => ({
    x,
    y: 0,
    z,
  });

  it("holds the shot against the block's nearest tile and centres the hit there", () => {
    // Shooter east of a block anchored at (1,3): the anchor is six tiles
    // off, the block's east column five — inside the fixture's range 5.
    const mission = missionWith(openField().build(), [
      unitAt("s", "infantry", tile(7, 3)),
      blockUnitAt("b", tile(1, 3)),
    ]);
    const checked = validateTargeting(mission, "s", "b", T);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.terrain.distance).toBe(5);
    expect(checked.value.target.pos).toEqual(tile(2, 3));
    expect(checked.value.target.footprint).toBe(2);
    // One tile further and the nearest tile is out of reach too.
    const further = missionWith(openField().build(), [
      unitAt("s", "infantry", tile(7, 3)),
      blockUnitAt("b", tile(0, 3)),
    ]);
    const refused = validateTargeting(further, "s", "b", T);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toEqual({
      kind: "out-of-range",
      distance: 6,
      range: 5,
    });
  });

  it("gives a block no cover and no flank, where a soldier on the same tile would have both", () => {
    // A crate west of the target's tile shields a soldier from the west
    // and leaves it flanked from the east; a block is too big to hide.
    const map = openField().prop(PropKindIds.CRATE, tile(2, 3)).build();
    const soldier = missionWith(map, [
      unitAt("w", "infantry", tile(0, 3)),
      unitAt("e", "infantry", tile(6, 3)),
      unitAt("t", "infantry", tile(3, 3), { team: "bugs" }),
    ]);
    const shielded = validateTargeting(soldier, "w", "t", T);
    const flanked = validateTargeting(soldier, "e", "t", T);
    expect(shielded.ok && shielded.value.terrain.cover).toBe(CoverLevel.LOW);
    expect(flanked.ok && flanked.value.terrain.flanked).toBe(true);
    const block = missionWith(map, [
      unitAt("w", "infantry", tile(0, 3)),
      unitAt("e", "infantry", tile(6, 3)),
      blockUnitAt("t", tile(3, 3)),
    ]);
    const west = validateTargeting(block, "w", "t", T);
    const east = validateTargeting(block, "e", "t", T);
    expect(west.ok && west.value.terrain.cover).toBe(CoverLevel.NONE);
    expect(west.ok && west.value.terrain.flanked).toBe(false);
    expect(east.ok && east.value.terrain.flanked).toBe(false);
  });

  it("lets a block attack from the tile of itself nearest the target", () => {
    const mission = missionWith(
      openField().build(),
      [blockUnitAt("b", tile(0, 3)), unitAt("t", "infantry", tile(6, 3))],
      { phase: "bugs" },
    );
    const checked = validateTargeting(mission, "b", "t", T);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.terrain.distance).toBe(5);
    const beyond = missionWith(
      openField().build(),
      [blockUnitAt("b", tile(0, 3)), unitAt("t", "infantry", tile(7, 3))],
      { phase: "bugs" },
    );
    const refused = validateTargeting(beyond, "b", "t", T);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toMatchObject({ kind: "out-of-range", distance: 6 });
  });
});

// ===========================================
// Damage tags and resistance (campaign arc §10.2)
// ===========================================

describe("a tagged hit on a mech that resists the tag (campaign arc §10.2)", () => {
  const PARTS = new StaticPartCatalogue(STARTER_PARTS);
  const AT = { pos: { x: 4, y: 0, z: 3 }, facing: "n" } as const;
  const FROM = { pos: { x: 1, y: 0, z: 3 }, facing: "s" } as const;

  /** A mech built through the unit factory from a validated loadout. */
  function builtMech(utilityIds: readonly string[]): UnitBuild {
    const loadout = { ...STARTER_LOADOUT, utilityIds: [...utilityIds] };
    const sheet = validateLoadout(
      loadout,
      PARTS,
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    if (!sheet.ok) throw new Error(JSON.stringify(sheet.error));
    return mechUnit(
      createMech(loadout, "mech-1", "Hammerhead"),
      sheet.value,
      AT,
      {
        ids: new SequentialIdGenerator(),
        tuning: UNIT_TUNING,
      },
    );
  }

  /** The Vanguard of the starter roster, its radiator swapped for the acid plating. */
  const plated = (): UnitBuild => builtMech([ACID_RESISTANT_PLATING]);
  /** The starter mech as shipped: no resistance. */
  const bare = (): UnitBuild => builtMech(["utility-radiator"]);

  /** A spitter from the unit factory, its spit swapped for `weapon` when given. */
  function spitter(weapon?: WeaponProfile): UnitBuild {
    const species = weapon === undefined ? SPITTER : { ...SPITTER, weapon };
    return bugUnit(species, FROM, { ids: new SequentialIdGenerator() });
  }

  /** The damage a certain, high-rolled shot of `bug` does to `mech`, through `resolveAttack`. */
  function hit(bug: UnitBuild, mech: UnitBuild): number {
    const field = missionWith(openField().build(), [
      bug.unit,
      { ...mech.unit, id: "target" },
    ]);
    const m: TacticalState = {
      ...field,
      phase: "bugs",
      templates: {
        ...field.templates,
        [bug.template.id]: bug.template,
        [mech.template.id]: mech.template,
      },
    };
    const result = resolveAttack(
      m,
      attack(bug.unit.id, "target"),
      ctxWith(riggedRng(true, "high")),
      T,
      DEPS,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const resolved = result.value.events.find(
      (event) => event.type === ATTACK_RESOLVED,
    );
    if (resolved?.type !== ATTACK_RESOLVED) throw new Error("no attack");
    expect(resolved.payload.hit).toBe(true);
    return resolved.payload.damage;
  }

  /** A spit hard enough to get through plate, so the resistance shows. */
  const HEAVY_ACID: WeaponProfile = { ...SPITTER.weapon, damage: 20 };
  /** The same shot with no tag at all. */
  const HEAVY_PLAIN: WeaponProfile = {
    range: HEAVY_ACID.range,
    accuracy: HEAVY_ACID.accuracy,
    damage: HEAVY_ACID.damage,
    armorPen: HEAVY_ACID.armorPen,
  };

  it("carries the plating's resistance from the part to the mech's template", () => {
    expect(plated().template.resist).toEqual({ acid: 3 });
    expect(bare().template).not.toHaveProperty("resist");
  });

  it("takes the plating's three points off every acid hit, and nothing off the same hit untagged", () => {
    const acid = hit(spitter(HEAVY_ACID), plated());
    const plain = hit(spitter(HEAVY_PLAIN), plated());
    expect(plain - acid).toBe(3);
    // Without the plating the tag makes no difference at all.
    expect(hit(spitter(HEAVY_ACID), bare())).toBe(
      hit(spitter(HEAVY_PLAIN), bare()),
    );
  });

  it("turns the spitter's own spit, a one-point scratch on bare plate, to nothing", () => {
    expect(hit(spitter(), bare())).toBe(1);
    expect(hit(spitter(), plated())).toBe(0);
  });
});

// ===========================================
// Under the ground (#1179)
// ===========================================

describe("a burrowed unit is out of every exchange of fire (#1179)", () => {
  /** A squad two tiles from a burrower, in the phase `phase`. */
  const board = (phase: TacticalState["phase"]): TacticalState =>
    missionWith(
      openField().build(),
      [
        unitAt("s", "infantry", { x: 1, y: 0, z: 1 }),
        burrowerAt("d", { x: 2, y: 0, z: 1 }),
      ],
      { phase },
    );

  it("cannot be targeted, previewed or shot at, however close", () => {
    const m = board("player");
    const refusal = { kind: "target-burrowed", targetId: "d" };
    const targeting = validateTargeting(m, "s", "d", T);
    expect(targeting.ok ? "ok" : targeting.error).toEqual(refusal);
    const preview = previewAttack(m, "s", "d", T);
    expect(preview.ok ? "ok" : preview.error).toEqual(refusal);
    const shot = createAttackHandler(T, DEPS)(
      m,
      attack("s", "d"),
      ctxWith(riggedRng(true)),
    );
    expect(shot.ok ? "ok" : shot.error).toEqual(refusal);
  });

  it("strikes at nothing from under the ground, at a unit or at a tile", () => {
    const m = board("bugs");
    const refusal = { kind: "unit-burrowed", unitId: "d" };
    const targeting = validateTargeting(m, "d", "s", T);
    expect(targeting.ok ? "ok" : targeting.error).toEqual(refusal);
    const bite = createAttackHandler(T, DEPS)(
      m,
      attack("d", "s"),
      ctxWith(riggedRng(true)),
    );
    expect(bite.ok ? "ok" : bite.error).toEqual(refusal);
    const ground = createAttackHandler(T, DEPS)(
      m,
      attackTile("d", { x: 1, y: 0, z: 1 }),
      ctxWith(riggedRng(true)),
    );
    expect(ground.ok ? "ok" : ground.error).toEqual(refusal);
  });

  it("is refused while it sleeps under the ground, and a sleeper on the surface is fair game (#1179)", () => {
    // The two statuses meet: a dormant bug lies in plain sight and can
    // be shot (the shot wakes it); burrowing is what hides a unit, asleep
    // or not.
    const m = board("player");
    const withStatus = (status: TacticalState["units"][number]["status"]) => ({
      ...m,
      units: m.units.map((unit) =>
        unit.id === "d" ? { ...unit, status } : unit,
      ),
    });
    const under = validateTargeting(
      withStatus(["burrowed", "dormant"]),
      "s",
      "d",
      T,
    );
    expect(under.ok ? "ok" : under.error).toEqual({
      kind: "target-burrowed",
      targetId: "d",
    });
    expect(validateTargeting(withStatus(["dormant"]), "s", "d", T).ok).toBe(
      true,
    );
  });

  it("is fair game again once it has come up", () => {
    const m = board("player");
    const up = {
      ...m,
      units: m.units.map((unit) =>
        unit.id === "d" ? { ...unit, status: [] } : unit,
      ),
    };
    expect(validateTargeting(up, "s", "d", T).ok).toBe(true);
  });
});

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
import type { CombatTuning } from "../model/combat-tuning";
import type { TacticalContext } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { UNIT_DIED } from "../model/unit-died-event";
import type { UnitTemplate } from "../model/unit-template";
import type { WeaponProfile } from "../model/weapon-profile";
import {
  attackTerrain,
  createAttackHandler,
  damageRange,
  hitChance,
  previewAttack,
  resolveAttack,
} from "./combat-service";

// ===========================================
// Fixtures
// ===========================================

const T = COMBAT_TUNING;
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
  const b = new FixtureMapBuilder(10, 6, 2).fillGround();
  b.prop(PropKindIds.CRATE, { x: 4, y: 0, z: 2 });
  b.wall({ x: 7, y: 0, z: 3 }, "w", "solid");
  b.tile({ x: 9, y: 1, z: 0 }, SurfaceIds.ROCK);
  return b.build();
}

function template(id: string, weapon: WeaponProfile, armor = 0): UnitTemplate {
  return {
    id,
    name: id,
    maxHp: 20,
    maxAp: 2,
    move: 5,
    weapon,
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
    extraction: [],
    log: [],
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
      65 + T.elevationPerLevel,
    );
    expect(hitChance(RIFLE, { ...NO_TERRAIN, elevation: -1 }, T)).toBe(
      65 - T.elevationPerLevel,
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
      attackTerrain(map, { x: 9, y: 1, z: 0 }, { x: 5, y: 0, z: 0 }).elevation,
    ).toBe(1);
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
    const a = resolveAttack(m, attack("s1", "b1"), ctx(3), T);
    const b = resolveAttack(m, attack("s1", "b1"), ctx(3), T);
    expect(b).toEqual(a);
    let hits = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const result = resolveAttack(m, attack("s1", "b1"), ctx(seed), T);
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

  it("applies damage, kills at zero with the killer named, and ends the attacker's turn", () => {
    const m = base();
    const hitSeed = [...Array(50).keys()]
      .map((i) => i + 1)
      .find((seed) => {
        const r = resolveAttack(m, attack("s1", "b1"), ctx(seed), T);
        return (
          r.ok &&
          r.value.events[0]?.type === ATTACK_RESOLVED &&
          r.value.events[0].payload.hit
        );
      });
    expect(hitSeed).toBeDefined();
    const result = resolveAttack(m, attack("s1", "b1"), ctx(hitSeed ?? 1), T);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state, events } = result.value;
    const target = state.units.find((u) => u.id === "b1");
    const attacker = state.units.find((u) => u.id === "s1");
    expect(target?.hp).toBe(0);
    expect(attacker?.ap).toBe(0);
    expect(events.map((e) => e.type)).toEqual([ATTACK_RESOLVED, UNIT_DIED]);
    expect(events[1]?.payload).toEqual({ unitId: "b1", killerId: "s1" });
    expect(state.units).toHaveLength(2);
    expect(m.units[1]?.hp).toBe(6);
  });

  it("spends only the attack cost when attacks do not end the turn, and a miss changes no hit points", () => {
    const tuning: CombatTuning = {
      ...T,
      attackEndsTurn: false,
      maxHitChance: 5,
      minHitChance: 5,
    };
    const m = base();
    const result = resolveAttack(m, attack("s1", "b1"), ctx(2), tuning);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const attacker = result.value.state.units.find((u) => u.id === "s1");
    expect(attacker?.ap).toBe(1);
    const missed = [...Array(30).keys()].some((seed) => {
      const r = resolveAttack(m, attack("s1", "b1"), ctx(seed + 1), tuning);
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
    const m = mission([
      unit("s1", "tdf", "rifle", 1, 1, { charges: 1 }),
      unit("b1", "bugs", "swarmer", 2, 1, { hp: 60, maxHp: 60 }),
    ]);
    const first = resolveAttack(m, attack("s1", "b1"), ctx(1), {
      ...T,
      attackEndsTurn: false,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.state.units[0]?.charges).toBe(0);
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
    const result = createAttackHandler(T)(m, attack("b1", "s1"), ctx(1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("wrong-phase");
    expect(m).toEqual(before);
  });
});

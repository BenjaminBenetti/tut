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
import { UNIT_DIED } from "../model/unit-died-event";
import type { UnitTemplate } from "../model/unit-template";
import type { WeaponProfile } from "../model/weapon-profile";
import { emptyVision } from "./vision-service";
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
    const applied = resolveAttack(m, attack("s1", "spawner-1"), riggedCtx(), T);
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
    // The attacker paid for the shot exactly as it would against a unit.
    expect(applied.value.state.units[0]?.ap).toBe(0);
    // Nothing is written into units for a spawner.
    expect(applied.value.state.units).toHaveLength(1);
  });

  it("destroying the last spawner completes its objective and ends the mission", () => {
    const [low] = damageRange(RIFLE, 0, T);
    const m = withSpawner([unit("s1", "tdf", "rifle", 0, 0)], { hp: low });
    const applied = resolveAttack(m, attack("s1", "spawner-1"), riggedCtx(), T);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.state.spawners[0]).toMatchObject({
      hp: 0,
      destroyed: true,
    });
    expect(applied.value.state.objectives[0]?.complete).toBe(true);
    expect(applied.value.state.outcome).toBe("won");
    expect(applied.value.events.map((e) => e.type)).toEqual([
      ATTACK_RESOLVED,
      SPAWNER_DAMAGED,
      OBJECTIVE_UPDATED,
      MISSION_ENDED,
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
    const applied = resolveAttack(m, attack("s1", "spawner-1"), riggedCtx(), T);
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
    expect(chances[0]).toBe(TEMPLATES.swarmer?.weapon.accuracy);
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

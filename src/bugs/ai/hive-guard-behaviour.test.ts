import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { PropKindIds } from "../../mapgen/data/props";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { validateAttack } from "../../tactical/service/combat-service";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { attackDistance } from "../../tactical/service/weapon-reach-service";
import { HIVE_GUARD_TUNING } from "../data/hive-guard-tuning";
import { HIVE_GUARD, SWARMER } from "../data/species";
import type { BehaviourContext } from "./bug-behaviour";
import {
  bugView,
  startedMission,
  walkableTileNear,
  withBug,
} from "./bug-mission.test-helper";
import { HiveGuardBehaviour } from "./hive-guard-behaviour";
import { attackOptions } from "./utility";

// ===========================================
// Fixtures
// ===========================================

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const ctx = (mission: TacticalState, seed: number): BehaviourContext => ({
  rng: new Mulberry32Rng(seed),
  combat: COMBAT_TUNING,
  graph: buildMoveGraph(mission.map),
});

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The guard's choice for every seed, so a tie-break cannot hide a move. */
function choices(
  mission: TacticalState,
  guardId: string,
  behaviour = new HiveGuardBehaviour(),
): (readonly TacticalCommand[])[] {
  return SEEDS.map((seed) =>
    behaviour.choose(bugView(mission), guardId, ctx(mission, seed)),
  );
}

/** A lone guard and one squad on open ground, `distance` tiles apart along x = 6. */
function openGround(distance: number): {
  mission: TacticalState;
  guardId: string;
} {
  const map = new FixtureMapBuilder(13, 13, 1).fillGround().build();
  const base = missionWith(map, [unitAt("mark", "infantry", at(6, 2))], {
    phase: "bugs",
  });
  const { mission, bug } = withBug(
    base,
    HIVE_GUARD,
    at(6, 2 + distance),
    "guard",
  );
  return { mission, guardId: bug.id };
}

// ===========================================
// Tests
// ===========================================

describe("HiveGuardBehaviour", () => {
  it("answers to the guard tag, which is the Hive Guard's", () => {
    expect(new HiveGuardBehaviour().tag).toBe(HIVE_GUARD.behaviour);
  });

  it("throws at a squad in reach and sight, from where it stands", () => {
    const { mission, guardId } = openGround(HIVE_GUARD.weapon.range);
    expect(attackDistance(at(6, 2), at(6, 9))).toBe(HIVE_GUARD.weapon.range);
    for (const commands of choices(mission, guardId)) {
      expect(commands).toEqual([
        { type: ATTACK, payload: { attackerId: guardId, targetId: "mark" } },
      ]);
    }
  });

  it("holds when the squad it perceives is out of reach, where a mobile bug would close", () => {
    // A swarmer spots the squad for the swarm, so the guard knows where
    // it is; eleven tiles is past the spines' seven, and the guard stays.
    const map = new FixtureMapBuilder(20, 13, 1).fillGround().build();
    const base = missionWith(map, [unitAt("mark", "infantry", at(1, 6))], {
      phase: "bugs",
    });
    const spotted = withBug(base, SWARMER, at(3, 6), "spotter");
    const { mission, bug } = withBug(
      spotted.mission,
      HIVE_GUARD,
      at(12, 6),
      "guard",
    );
    expect(bugView(mission).units.map((u) => u.id)).toContain("mark");
    expect(attackDistance(bug.pos, at(1, 6))).toBeGreaterThan(
      HIVE_GUARD.weapon.range,
    );
    for (const commands of choices(mission, bug.id)) {
      expect(commands).toEqual([]);
    }
  });

  it("holds when a wall stands between it and a squad in reach", () => {
    // A solid wall across the field between z = 5 and z = 6. The squad
    // is six tiles off, inside the reach, and a swarmer on its side of
    // the wall has spotted it; the guard cannot see through the wall.
    const builder = new FixtureMapBuilder(13, 13, 1).fillGround();
    for (let x = 0; x < 13; x++) {
      builder.wall(at(x, 6), "n", "solid");
    }
    const base = missionWith(
      builder.build(),
      [unitAt("mark", "infantry", at(6, 3))],
      { phase: "bugs" },
    );
    const spotted = withBug(base, SWARMER, at(6, 4), "spotter");
    const { mission, bug } = withBug(
      spotted.mission,
      HIVE_GUARD,
      at(6, 9),
      "guard",
    );
    expect(bugView(mission).units.map((u) => u.id)).toContain("mark");
    expect(attackDistance(bug.pos, at(6, 3))).toBeLessThanOrEqual(
      HIVE_GUARD.weapon.range,
    );
    expect(validateAttack(mission, bug.id, "mark", COMBAT_TUNING).ok).toBe(
      false,
    );
    for (const commands of choices(mission, bug.id)) {
      expect(commands).toEqual([]);
    }
  });

  it("finishes a squad it can kill before wounding one it cannot, even at a worse price", () => {
    // `finish` (6 hp) crouches behind a crate five tiles off; a top-of-range
    // volley (6) kills it. `tough` (7 hp) stands in the open two tiles off
    // and survives any volley. The open shot is worth more by expected
    // damage alone; the kill is what turns the guard.
    const map = new FixtureMapBuilder(13, 13, 1)
      .fillGround()
      .prop(PropKindIds.CRATE, at(6, 4))
      .build();
    const finish = unitAt("finish", "infantry", at(6, 3), { hp: 6 });
    const tough = unitAt("tough", "infantry", at(8, 8), { hp: 7 });
    const base = missionWith(map, [finish, tough], { phase: "bugs" });
    const { mission, bug } = withBug(base, HIVE_GUARD, at(6, 8), "guard");
    const options = attackOptions(bugView(mission), bug.id, COMBAT_TUNING);
    const byId = new Map(options.map((o) => [o.target.id, o]));
    expect(byId.get("finish")?.canKill).toBe(true);
    expect(byId.get("tough")?.canKill).toBe(false);
    expect(byId.get("tough")!.value).toBeGreaterThan(byId.get("finish")!.value);

    for (const commands of choices(mission, bug.id)) {
      expect(commands).toEqual([
        { type: ATTACK, payload: { attackerId: bug.id, targetId: "finish" } },
      ]);
    }
    // The control: with the kill worth nothing the guard takes the
    // better-priced open shot, so the kill bonus is what decided.
    const indifferent = new HiveGuardBehaviour({
      ...HIVE_GUARD_TUNING,
      killWeight: 0,
    });
    for (const commands of choices(mission, bug.id, indifferent)) {
      expect(commands).toEqual([
        { type: ATTACK, payload: { attackerId: bug.id, targetId: "tough" } },
      ]);
    }
  });

  it("holds rather than hunting when it perceives no enemy, and a dead guard does nothing", () => {
    const base = startedMission("bugs");
    const noEnemies = {
      ...base,
      units: base.units.filter((u) => u.team !== "tdf"),
    };
    const { mission, bug } = withBug(
      noEnemies,
      HIVE_GUARD,
      walkableTileNear(noEnemies, { x: 1, y: 0, z: 1 }),
    );
    for (const commands of choices(mission, bug.id)) {
      expect(commands).toEqual([]);
    }
    const dead = {
      ...mission,
      units: mission.units.map((u) => (u.id === bug.id ? { ...u, hp: 0 } : u)),
    };
    expect(
      new HiveGuardBehaviour().choose(bugView(dead), bug.id, ctx(dead, 1)),
    ).toEqual([]);
  });

  it("never asks to move, at any distance from the squad", () => {
    for (let distance = 1; distance <= 10; distance++) {
      const { mission, guardId } = openGround(distance);
      for (const commands of choices(mission, guardId)) {
        expect(commands.some((c) => c.type === MOVE)).toBe(false);
        expect(commands.length).toBe(
          distance <= HIVE_GUARD.weapon.range ? 1 : 0,
        );
      }
    }
  });
});

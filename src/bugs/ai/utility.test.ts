import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { Unit } from "../../tactical/model/unit";
import { HookKinds } from "../../mapgen/model/hook";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import {
  bestBy,
  clumpScore,
  distanceScore,
  exposureScore,
  huntableEnemies,
  huntSite,
  landingSite,
  overwatchScore,
  tileDistance,
} from "./utility";

describe("utility scores", () => {
  it("distanceScore is 1 at zero distance and 0 at or past the maximum", () => {
    const origin = { x: 0, y: 0, z: 0 };
    expect(distanceScore(origin, origin, 10)).toBe(1);
    expect(distanceScore(origin, { x: 5, y: 0, z: 0 }, 10)).toBeCloseTo(0.5);
    expect(distanceScore(origin, { x: 7, y: 0, z: 7 }, 10)).toBe(0);
    expect(distanceScore(origin, { x: 1, y: 0, z: 0 }, 0)).toBe(0);
  });

  it("tileDistance ignores levels", () => {
    expect(tileDistance({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 1 })).toBe(3);
  });

  it("overwatchScore is the fraction of watching enemies whose sight covers the tile", () => {
    const mission = missionWith(
      new FixtureMapBuilder(8, 8, 2).fillGround().build(),
      [
        unitAt(
          "watcher-near",
          "infantry",
          { x: 1, y: 0, z: 0 },
          {
            status: ["overwatch"],
          },
        ),
        unitAt(
          "watcher-far",
          "infantry",
          { x: 7, y: 0, z: 7 },
          {
            status: ["overwatch"],
          },
        ),
        unitAt("idle", "infantry", { x: 2, y: 0, z: 0 }),
        unitAt(
          "downed",
          "infantry",
          { x: 3, y: 0, z: 0 },
          {
            hp: 0,
            status: ["overwatch"],
          },
        ),
      ],
    );
    const enemies = mission.units;
    // Both living watchers are inside their sight range of this tile
    // (7 and 6 against 8), and neither the idle soldier nor the dead one
    // counts as watching. "Open ground" is not the reason — see the
    // range case below.
    expect(overwatchScore(mission, { x: 4, y: 0, z: 4 }, enemies)).toBe(1);
    // Nobody on overwatch at all scores zero rather than dividing by it.
    expect(
      overwatchScore(
        mission,
        { x: 4, y: 0, z: 4 },
        enemies.filter((u) => !u.status.includes("overwatch")),
      ),
    ).toBe(0);
    expect(overwatchScore(mission, { x: 4, y: 0, z: 4 }, [])).toBe(0);
  });

  it("counts nobody who is out of sight range, however clear the line (#663)", () => {
    // A map-sized field, because that is where this bites: both scores
    // used to ask only for a line and so read 1 from any distance at
    // all. On a 42-tile map that is every tile a bug will ever stand on.
    const mission = missionWith(
      new FixtureMapBuilder(42, 8, 2).fillGround().build(),
      [
        unitAt(
          "watcher",
          "infantry",
          { x: 0, y: 0, z: 0 },
          {
            status: ["overwatch"],
          },
        ),
      ],
    );
    const enemies = mission.units;
    const at = (x: number) => ({ x, y: 0, z: 0 });
    // Sight range 8 for the fixture's infantry: inside it, covered.
    expect(overwatchScore(mission, at(8), enemies)).toBe(1);
    expect(exposureScore(mission, at(8), enemies)).toBe(1);
    // One tile further, with nothing in the way at all, is not covered.
    expect(overwatchScore(mission, at(9), enemies)).toBe(0);
    expect(exposureScore(mission, at(9), enemies)).toBe(0);
    // And it stays 0 out to the far edge, rather than the flat 1 the
    // old score gave every tile on the board.
    expect(overwatchScore(mission, at(40), enemies)).toBe(0);
    expect(exposureScore(mission, at(40), enemies)).toBe(0);
  });

  it("clumpScore is the fraction of enemies within the radius", () => {
    const unit = (id: string, x: number) =>
      ({
        id,
        pos: { x, y: 0, z: 0 },
        hp: 5,
      }) as unknown as Unit;
    const enemies = [unit("a", 1), unit("b", 2), unit("c", 9)];
    expect(clumpScore({ x: 0, y: 0, z: 0 }, enemies, 2)).toBeCloseTo(2 / 3);
    expect(clumpScore({ x: 0, y: 0, z: 0 }, [], 2)).toBe(0);
  });

  it("bestBy returns the top item and breaks exact ties with the rng", () => {
    const rng = new Mulberry32Rng(3);
    expect(bestBy([], () => 1, rng)).toBeUndefined();
    expect(bestBy([1, 5, 3], (n) => n, rng)).toBe(5);
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) {
      picks.add(bestBy(["a", "b", "c"], () => 1, new Mulberry32Rng(i))!);
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});

// ===========================================
// Hunting turrets
// ===========================================

describe("huntableEnemies (#1155)", () => {
  const at = (x: number, z: number) => ({ x, y: 0, z });
  const turretAt = (id: string, x: number, z: number): Unit => ({
    ...unitAt(id, "infantry", at(x, z)),
    kind: "turret",
  });
  const bug = unitAt("bug", "infantry", at(0, 0), { team: "bugs" });
  const field = (units: readonly Unit[]) =>
    missionWith(new FixtureMapBuilder(10, 10, 2).fillGround().build(), [
      bug,
      ...units,
    ]);
  const ids = (units: readonly Unit[]) => units.map((u) => u.id);

  it("keeps every crewed enemy and a turret only when it is the nearest hostile", () => {
    const mission = field([
      unitAt("squad", "infantry", at(4, 0)),
      turretAt("near", 2, 0),
      turretAt("far", 7, 7),
    ]);
    expect(ids(huntableEnemies(mission, bug))).toEqual(["squad", "near"]);
  });

  it("drops a turret that would be a detour past the crew", () => {
    const mission = field([
      unitAt("squad", "infantry", at(1, 0)),
      turretAt("turret", 3, 0),
    ]);
    expect(ids(huntableEnemies(mission, bug))).toEqual(["squad"]);
  });

  it("goes for the nearest turret when turrets are all it perceives, and skips the dead", () => {
    const mission = field([
      turretAt("far", 7, 0),
      turretAt("near", 3, 0),
      { ...turretAt("down", 1, 0), hp: 0 },
    ]);
    expect(ids(huntableEnemies(mission, bug))).toEqual(["near"]);
    expect(huntableEnemies(field([]), bug)).toEqual([]);
  });
});

// ===========================================
// Generators (#1175)
// ===========================================

describe("huntableEnemies with generators on the board (#1175)", () => {
  const at = (x: number, z: number) => ({ x, y: 0, z });
  const kindAt = (
    kind: Unit["kind"],
    id: string,
    x: number,
    z: number,
  ): Unit => ({
    ...unitAt(id, "infantry", at(x, z)),
    kind,
  });
  const bug = unitAt("bug", "infantry", at(0, 0), { team: "bugs" });
  const field = (units: readonly Unit[]) =>
    missionWith(new FixtureMapBuilder(10, 10, 2).fillGround().build(), [
      bug,
      ...units,
    ]);
  const ids = (units: readonly Unit[]) => units.map((u) => u.id);

  it("keeps every generator it sees, however far, beside the crew and the nearest turret", () => {
    const mission = field([
      unitAt("squad", "infantry", at(1, 0)),
      kindAt("turret", "near-turret", 2, 0),
      kindAt("turret", "far-turret", 8, 8),
      kindAt("generator", "far-gen", 9, 9),
      kindAt("generator", "gen", 5, 5),
    ]);
    expect(ids(huntableEnemies(mission, bug))).toEqual([
      "squad",
      "near-turret",
      "far-gen",
      "gen",
    ]);
  });

  it("skips a wrecked generator", () => {
    const mission = field([
      { ...kindAt("generator", "down", 3, 3), hp: 0 },
      kindAt("generator", "up", 6, 6),
    ]);
    expect(ids(huntableEnemies(mission, bug))).toEqual(["up"]);
  });
});

describe("huntSite (#1175)", () => {
  const at = (x: number, z: number) => ({ x, y: 0, z });
  const map = new FixtureMapBuilder(12, 12, 2)
    .fillGround()
    .deploy([at(11, 11)])
    .objective(HookKinds.GENERATOR, [at(2, 2)])
    .objective(HookKinds.GENERATOR, [at(8, 8)])
    .build();

  it("heads for the nearest generator hook that still has a generator on it", () => {
    const mission = missionWith(map, []);
    expect(huntSite(mission, at(0, 0))).toEqual(at(2, 2));
    expect(huntSite(mission, at(9, 9))).toEqual(at(8, 8));
  });

  it("passes a hook whose generator has been wrecked", () => {
    const wrecked = {
      ...unitAt("gen-1", "infantry", at(2, 2), { hp: 0 }),
      kind: "generator" as const,
    };
    const mission = missionWith(map, [wrecked]);
    expect(huntSite(mission, at(0, 0))).toEqual(at(8, 8));
  });

  it("falls back to the landing zone on a map with no generator hooks", () => {
    const plain = new FixtureMapBuilder(12, 12, 2)
      .fillGround()
      .deploy([at(11, 11)])
      .build();
    const mission = missionWith(plain, []);
    expect(huntSite(mission, at(0, 0))).toEqual(landingSite(mission, at(0, 0)));
    expect(huntSite(mission, at(0, 0))).toEqual(at(11, 11));
  });
});

import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { SWARMER } from "../data/species";
import { SWARMER_TUNING } from "../data/swarmer-tuning";
import type { BehaviourContext } from "./bug-behaviour";
import { applyMoveTo, withBug, bugView } from "./bug-mission.test-helper";
import { SwarmerBehaviour } from "./swarmer-behaviour";
import { tileDistance } from "./utility";

// ===========================================
// Fixtures
// ===========================================

const ctx = (mission: TacticalState, seed: number): BehaviourContext => ({
  rng: new Mulberry32Rng(seed),
  combat: COMBAT_TUNING,
  graph: buildMoveGraph(mission.map),
});

/** A flat, wall-free `size × size` grass field: the open map of the acceptance criterion. */
function openField(size: number): TacticalMap {
  return new FixtureMapBuilder(size, size, 2).fillGround().build();
}

/**
 * An open field in the bugs' phase holding one stationary TDF squad, plus
 * one swarmer per entry in `bugsAt` — all sharing the swarmer `sourceId`,
 * so they count as each other's kin.
 */
function field(
  size: number,
  squadAt: TileCoord,
  bugsAt: readonly TileCoord[],
): TacticalState {
  let mission = missionWith(
    openField(size),
    [unitAt("squad-1", "infantry", squadAt)],
    { phase: "bugs" },
  );
  bugsAt.forEach((pos, i) => {
    mission = withBug(mission, SWARMER, pos, `swarmer-${i + 1}`).mission;
  });
  return mission;
}

/** The unit with that id; the fixtures always have one. */
function unit(mission: TacticalState, id: string): Unit {
  return mission.units.find((u) => u.id === id)!;
}

/**
 * Runs the swarmer's turns until it bites or `turns` run out. `distances`
 * holds the gap to the squad at the start, then after each turn the
 * swarmer actually moved — the turn it stands still to bite closes no
 * distance and is reported by `attacked` instead.
 */
function rush(
  start: TacticalState,
  bugId: string,
  seed: number,
  turns: number,
): { distances: number[]; attacked: boolean; end: Unit } {
  const swarmer = new SwarmerBehaviour();
  let mission = start;
  const squad = unit(mission, "squad-1");
  const distances = [tileDistance(unit(mission, bugId).pos, squad.pos)];
  let attacked = false;
  for (let turn = 0; turn < turns && !attacked; turn++) {
    let moved = false;
    for (const command of swarmer.choose(
      bugView(mission),
      bugId,
      ctx(mission, seed * 31 + turn),
    )) {
      if (command.type === MOVE) {
        mission = applyMoveTo(mission, bugId, command.payload.path);
        moved = true;
      }
      if (command.type === ATTACK) {
        attacked = true;
      }
    }
    if (!moved) {
      break;
    }
    distances.push(tileDistance(unit(mission, bugId).pos, squad.pos));
  }
  return { distances, attacked, end: unit(mission, bugId) };
}

// ===========================================
// Tests
// ===========================================

describe("SwarmerBehaviour", () => {
  it("answers to the rush tag", () => {
    expect(new SwarmerBehaviour().tag).toBe("rush");
  });

  it("closes distance every turn on an open map, from every corner and seed", () => {
    // Nine tiles across, so every corner is eight from the squad and
    // inside a swarmer's sight: since ADR 0006 a bug rushes what it can
    // see, and the case where it can see nothing is the test below.
    const size = 9;
    const squadAt = { x: 4, y: 0, z: 4 };
    const corners: readonly TileCoord[] = [
      { x: 0, y: 0, z: 0 },
      { x: size - 1, y: 0, z: 0 },
      { x: 0, y: 0, z: size - 1 },
      { x: size - 1, y: 0, z: size - 1 },
    ];
    for (const corner of corners) {
      for (let seed = 0; seed < 6; seed++) {
        const mission = field(size, squadAt, [corner]);
        const { distances, attacked, end } = rush(
          mission,
          "swarmer-1",
          seed,
          8,
        );
        // Every turn it moves, it ends strictly closer than it started.
        for (let turn = 1; turn < distances.length; turn++) {
          expect(distances[turn]!).toBeLessThan(distances[turn - 1]!);
        }
        expect(attacked).toBe(true);
        expect(tileDistance(end.pos, squadAt)).toBe(1);
      }
    }
  });

  it("holds when it can perceive no enemy at all (ADR 0006)", () => {
    // The squad is twenty tiles off, well past a swarmer's sight, so the
    // view it is handed has no enemy in it and there is nothing to rush.
    const mission = field(24, { x: 20, y: 0, z: 20 }, [{ x: 0, y: 0, z: 0 }]);
    const commands = new SwarmerBehaviour().choose(
      bugView(mission),
      "swarmer-1",
      ctx(mission, 1),
    );
    expect(commands).toEqual([]);
  });

  it("bites what it can already reach instead of moving", () => {
    const mission = field(8, { x: 4, y: 0, z: 4 }, [{ x: 4, y: 0, z: 3 }]);
    const commands = new SwarmerBehaviour().choose(
      bugView(mission),
      "swarmer-1",
      ctx(mission, 1),
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe(ATTACK);
    expect(commands[0]?.payload).toMatchObject({ targetId: "squad-1" });
  });

  it("groups up: between two tiles equally close to the target it takes the one beside its kin", () => {
    // The squad sits in the corner, so exactly two tiles are adjacent to
    // it — (1,0,0) and (0,0,1) — and only (0,0,1) has kin within reach.
    //
    //   z=0  S . . . . . . . B      S = squad   B = the rushing swarmer
    //   z=1  a                      a = the two tiles tied on distance
    //   z=3  K                      K = kin
    const mission = field(9, { x: 0, y: 0, z: 0 }, [
      { x: 8, y: 0, z: 0 },
      { x: 0, y: 0, z: 3 },
    ]);
    for (let seed = 0; seed < 6; seed++) {
      const commands = new SwarmerBehaviour().choose(
        bugView(mission),
        "swarmer-1",
        ctx(mission, seed),
      );
      const step = commands.find((c) => c.type === MOVE);
      expect(step).toBeDefined();
      expect(step!.payload.path.at(-1)).toEqual({ x: 0, y: 0, z: 1 });
    }
  });

  it("approach dominates company: the shipped rush leaves its kin behind, a company-hungry tuning does not", () => {
    // Squad one way, kin the other. The weights alone decide which wins.
    const squadAt = { x: 0, y: 0, z: 0 };
    const kinAt = { x: 8, y: 0, z: 6 };
    const mission = field(9, squadAt, [{ x: 8, y: 0, z: 0 }, kinAt]);
    const endOf = (behaviour: SwarmerBehaviour, seed: number): TileCoord =>
      behaviour
        .choose(bugView(mission), "swarmer-1", ctx(mission, seed))
        .find((c) => c.type === MOVE)!
        .payload.path.at(-1)!;

    const shipped = new SwarmerBehaviour();
    const clingy = new SwarmerBehaviour({
      ...SWARMER_TUNING,
      swarmWeight: 20,
    });
    for (let seed = 0; seed < 6; seed++) {
      expect(tileDistance(endOf(shipped, seed), squadAt)).toBe(1);
      expect(tileDistance(endOf(clingy, seed), kinAt)).toBeLessThanOrEqual(
        SWARMER_TUNING.swarmRadius,
      );
    }
  });

  it("holds still with no enemies and ignores dead swarmers", () => {
    const mission = field(8, { x: 4, y: 0, z: 4 }, [{ x: 0, y: 0, z: 0 }]);
    const swarmer = new SwarmerBehaviour();
    const noEnemies: TacticalState = {
      ...mission,
      units: mission.units.filter((u) => u.team !== "tdf"),
    };
    expect(
      swarmer.choose(bugView(noEnemies), "swarmer-1", ctx(noEnemies, 1)),
    ).toEqual([]);
    const dead: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === "swarmer-1" ? { ...u, hp: 0 } : u,
      ),
    };
    expect(swarmer.choose(bugView(dead), "swarmer-1", ctx(dead, 1))).toEqual(
      [],
    );
    expect(swarmer.choose(bugView(mission), "nobody", ctx(mission, 1))).toEqual(
      [],
    );
  });
});

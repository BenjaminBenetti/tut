import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { MOVE } from "../../tactical/model/move-command";
import type { MoveCommand } from "../../tactical/model/move-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { BRUTE } from "../data/species";
import { BRUTE_TUNING } from "../data/brute-tuning";
import { overwatchScore } from "./utility";
import { adjacentCount, BruteBehaviour } from "./brute-behaviour";
import type { BehaviourContext } from "./bug-behaviour";
import { withBug, bugView } from "./bug-mission.test-helper";
import { tileDistance } from "./utility";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });

const ctx = (mission: TacticalState, seed = 1): BehaviourContext => ({
  rng: new Mulberry32Rng(seed),
  combat: COMBAT_TUNING,
  graph: buildMoveGraph(mission.map),
});

/** A flat, wall-free `size × size` grass field. */
function openField(size: number): TacticalMap {
  return new FixtureMapBuilder(size, size, 2).fillGround().build();
}

/**
 * A bugs-phase mission on an open field: one TDF soldier per entry in
 * `squadAt`, and one brute at `bruteAt`.
 */
function field(
  size: number,
  squadAt: readonly TileCoord[],
  bruteAt: TileCoord,
  map: TacticalMap = openField(size),
): TacticalState {
  const squad = squadAt.map((pos, i) =>
    unitAt(`squad-${String(i + 1)}`, "infantry", pos),
  );
  const mission = missionWith(map, squad, { phase: "bugs" });
  return withBug(mission, BRUTE, bruteAt, "brute-1").mission;
}

/** The unit with that id; the fixtures always have one. */
function unit(mission: TacticalState, id: string): Unit {
  return mission.units.find((u) => u.id === id)!;
}

/** Where the brute's plan puts it, or where it already stands if it does not move. */
function destinationOf(
  mission: TacticalState,
  commands: readonly TacticalCommand[],
): TileCoord {
  const step = commands.find((c): c is MoveCommand => c.type === MOVE);
  return step?.payload.path.at(-1) ?? unit(mission, "brute-1").pos;
}

/** The brute's plan for `brute-1` on this mission. */
function plan(
  mission: TacticalState,
  seed = 1,
  behaviour = new BruteBehaviour(),
): readonly TacticalCommand[] {
  return behaviour.choose(bugView(mission), "brute-1", ctx(mission, seed));
}

// ===========================================
// Tests
// ===========================================

describe("BruteBehaviour", () => {
  it("has the punish-clumps tag the brute species asks for", () => {
    expect(new BruteBehaviour().tag).toBe("punish-clumps");
    expect(BRUTE.behaviour).toBe("punish-clumps");
  });

  // Note on what isolates what: adjacency and crowd agree in ordinary
  // geometry, so this criterion is met by either term alone. The test
  // that isolates `adjacentWeight` as the thing deciding contact is
  // "consults its tuning" below, which flips the outcome when the weight
  // is inverted.
  it("walks at the tile adjacent to the most units (#334)", () => {
    // A lone soldier one step west; a knot of three to the east, whose
    // centre tile (5,4) touches all three.
    const mission = field(
      10,
      [at(1, 4), at(4, 4), at(6, 4), at(5, 3)],
      at(3, 4),
    );
    const commands = plan(mission);
    const destination = destinationOf(mission, commands);
    const enemies = mission.units.filter((u) => u.team === "tdf");
    expect(adjacentCount(destination, enemies)).toBe(3);
    expect(destination).toEqual(at(5, 4));
  });

  it("prefers two bodies in contact over one, even at a detour", () => {
    // (3,4) touches the pair; (1,4) touches the straggler and is the
    // same distance from the brute. The pair must win.
    const mission = field(10, [at(0, 4), at(3, 3), at(3, 5)], at(2, 4));
    const destination = destinationOf(mission, plan(mission));
    expect(
      adjacentCount(destination, [
        unit(mission, "squad-2"),
        unit(mission, "squad-3"),
      ]),
    ).toBe(2);
  });

  it("walks off a straggler it is already touching to reach a crowd", () => {
    // The brute starts in contact with one soldier; three more are
    // clustered within its 3-tile move. Punishing clumps means leaving.
    const mission = field(
      10,
      [at(2, 4), at(5, 4), at(5, 3), at(5, 5)],
      at(3, 4),
    );
    const commands = plan(mission);
    expect(commands.some((c) => c.type === MOVE)).toBe(true);
    const destination = destinationOf(mission, commands);
    expect(tileDistance(destination, at(5, 4))).toBeLessThanOrEqual(1);
  });

  it("ignores cover: takes the open tile beside the crowd over shelter beside nobody", () => {
    // (2,4) is walled on three sides — excellent cover, no company.
    // (5,4) is bare ground touching two soldiers.
    const builder = new FixtureMapBuilder(10, 10, 2).fillGround();
    for (const side of ["n", "s", "w"] as const) {
      builder.wall(at(2, 4), side, "solid");
    }
    const mission = field(10, [at(6, 4), at(5, 3)], at(3, 4), builder.build());
    const destination = destinationOf(mission, plan(mission));
    expect(destination).not.toEqual(at(2, 4));
    const enemies = mission.units.filter((u) => u.team === "tdf");
    expect(adjacentCount(destination, enemies)).toBeGreaterThan(0);
  });

  it("soaks overwatch: walks into contact anyway with the guns trained on it", () => {
    // A lurker would price the watchers' line of fire as a cost and hang
    // back. The brute is armored and the shots it draws spend the
    // watchers' overwatch, so it must still close.
    const mission = field(10, [at(5, 4), at(5, 3), at(5, 5)], at(2, 4));
    const watched: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.team === "tdf" ? { ...u, status: ["overwatch" as const] } : u,
      ),
    };
    const enemies = watched.units.filter((u) => u.team === "tdf");
    const closed = destinationOf(watched, plan(watched));
    expect(adjacentCount(closed, enemies)).toBeGreaterThan(0);

    // And the term is live, which is what makes the closing above worth
    // asserting. Turn the reward into a heavy penalty and the brute goes
    // the other way — out of the watchers' reach entirely.
    //
    // This case used to assert the opposite, that the penalty changed
    // nothing, on the reasoning that "every watcher sees every tile so
    // overwatchScore is 1 everywhere and the term cancels". That was
    // true, and it was the bug (#663): the score asked only for a clear
    // line and never for sight range, so it read 1 from any distance at
    // all and no weight could move it. A term that cancels is not a
    // tie-breaker, it is a term that is not there.
    const timid = new BruteBehaviour({
      ...BRUTE_TUNING,
      overwatchWeight: -20,
    });
    const fled = destinationOf(watched, plan(watched, 1, timid));
    const index = new TileIndex(watched.map);
    expect(adjacentCount(fled, enemies)).toBe(0);
    // Fewer guns bear on where it went than on where it would have
    // closed. Not zero — one of the three still reaches that corner at
    // exactly its sight range — and that is the point: the score is a
    // gradient now, where before it was 1 on every tile of the map.
    expect(overwatchScore(watched, fled, enemies, index)).toBeLessThan(
      overwatchScore(watched, closed, enemies, index),
    );
  });

  it("swings where it stands when nothing reachable is worth more", () => {
    // Boxed in against a single soldier with no better tile: attack.
    const mission = field(4, [at(1, 1)], at(1, 2));
    const commands = plan(mission);
    expect(commands.map((c) => c.type)).toEqual([ATTACK]);
  });

  it("attacks after wading in when the walk leaves an action point", () => {
    // (5,4) is the only tile touching both soldiers and is two steps
    // away, so one action point is left to swing with.
    const mission = field(10, [at(5, 3), at(5, 5)], at(3, 4));
    const commands = plan(mission);
    expect(destinationOf(mission, commands)).toEqual(at(5, 4));
    expect(commands.map((c) => c.type)).toEqual([MOVE, ATTACK]);
  });

  it("holds still with no living enemies, and for a unit that is gone or dead", () => {
    const empty = withBug(
      missionWith(openField(6), [], { phase: "bugs" }),
      BRUTE,
      at(2, 2),
      "brute-1",
    ).mission;
    expect(plan(empty)).toEqual([]);

    const dead = field(6, [at(1, 1)], at(3, 3));
    const downed: TacticalState = {
      ...dead,
      units: dead.units.map((u) => (u.id === "brute-1" ? { ...u, hp: 0 } : u)),
    };
    expect(plan(downed)).toEqual([]);
    expect(
      new BruteBehaviour().choose(bugView(dead), "nobody", ctx(dead)),
    ).toEqual([]);
  });

  it("is deterministic: the same mission and seed replay the same plan", () => {
    const mission = field(10, [at(5, 4), at(5, 3), at(1, 1)], at(3, 4));
    expect(plan(mission, 9)).toEqual(plan(mission, 9));
  });

  it("prefers three bodies in contact to two", () => {
    // (5,4) touches three; (3,3) touches two and is nearer the brute.
    const mission = field(
      12,
      [at(2, 3), at(4, 3), at(5, 3), at(6, 4), at(5, 5)],
      at(3, 4),
    );
    const enemies = mission.units.filter((u) => u.team === "tdf");
    const destination = destinationOf(mission, plan(mission));
    expect(adjacentCount(destination, enemies)).toBe(3);
  });

  it("consults its tuning: a brute repelled by contact keeps its distance", () => {
    // adjacentWeight is the knob the whole behaviour turns on. Invert it
    // and the same fixture must produce the opposite arrangement, which
    // no hard-coded preference for the crowd could fake.
    const mission = field(10, [at(5, 4), at(5, 3), at(5, 5)], at(3, 4));
    const shy = new BruteBehaviour({ ...BRUTE_TUNING, adjacentWeight: -5 });
    const enemies = mission.units.filter((u) => u.team === "tdf");
    expect(
      adjacentCount(destinationOf(mission, plan(mission, 1, shy)), enemies),
    ).toBe(0);
    expect(
      adjacentCount(destinationOf(mission, plan(mission)), enemies),
    ).toBeGreaterThan(0);
  });
});

describe("adjacentCount", () => {
  it("counts living enemies orthogonally adjacent on the tile's own level", () => {
    const enemies = [
      unitAt("n", "infantry", at(5, 3)),
      unitAt("e", "infantry", at(6, 4)),
      unitAt("diagonal", "infantry", at(6, 3)),
      unitAt("far", "infantry", at(8, 4)),
      unitAt("above", "infantry", at(5, 3, 1)),
    ];
    expect(adjacentCount(at(5, 4), enemies)).toBe(2);
    expect(adjacentCount(at(0, 0), enemies)).toBe(0);
  });
});

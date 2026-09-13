import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { WallKind } from "../../mapgen/model/wall";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { BLAST_RESOLVED } from "../../tactical/model/blast-resolved-event";
import { endTurn } from "../../tactical/model/end-turn-command";
import { MOVE } from "../../tactical/model/move-command";
import type { MoveCommand } from "../../tactical/model/move-command";
import { STRUCTURE_DESTROYED } from "../../tactical/model/structure-destroyed-event";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { createAttackHandler } from "../../tactical/service/combat-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import type { TacticalHandlers } from "../../tactical/service/tactical-command-handlers";
import {
  ctxWith,
  fixtureAttackDeps,
  missionWith,
  riggedRng,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import {
  createEndTurnHandler,
  createOverwatchReaction,
  DEFAULT_PHASE_STEPS,
} from "../../tactical/service/turn-service";
import { BRUTE, BUG_SPECIES } from "../data/species";
import { BRUTE_TUNING } from "../data/brute-tuning";
import { createSpeciesLookup } from "../service/species-lookup";
import { MapBehaviourRegistry } from "./behaviour-registry";
import { overwatchScore } from "./utility";
import { adjacentCount, breachTarget, BruteBehaviour } from "./brute-behaviour";
import { createBugPhaseRunner } from "./bug-phase-runner";
import type { BehaviourContext } from "./bug-behaviour";
import { withBug, bugView } from "./bug-mission.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });

const ctx = (mission: TacticalState, seed = 1): BehaviourContext => ({
  rng: new Mulberry32Rng(seed),
  combat: COMBAT_TUNING,
  graph: buildMoveGraph(mission.map),
});

/** The brute's tiles per side (#1130); the fixtures below lay out for it. */
const SIZE = BRUTE.footprint ?? 1;

/** A flat, wall-free `size × size` grass field. */
function openField(size: number): TacticalMap {
  return new FixtureMapBuilder(size, size, 2).fillGround().build();
}

/**
 * A bugs-phase mission on an open field: one TDF soldier per entry in
 * `squadAt`, and one brute anchored at `bruteAt` — the lowest-`x`,
 * lowest-`z` tile of its 2×2 block (#1130), so a brute at `(3, 4)`
 * stands on `(3, 4)`, `(4, 4)`, `(3, 5)` and `(4, 5)`. Its neighbours
 * are the eight tiles around that block, two a side.
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

  it("stands on a 2×2 block (#1130), which is what these fixtures lay out for", () => {
    expect(SIZE).toBe(2);
    const mission = field(6, [], at(1, 1));
    expect(
      mission.templates[unit(mission, "brute-1").templateId]?.footprint,
    ).toBe(2);
  });

  // Note on what isolates what: adjacency and crowd agree in ordinary
  // geometry, so this criterion is met by either term alone. The test
  // that isolates `adjacentWeight` as the thing deciding contact is
  // "consults its tuning" below, which flips the outcome when the weight
  // is inverted.
  it("walks at the tile adjacent to the most units (#334)", () => {
    // A lone soldier off to the west; a knot of three to the east that
    // the block anchored at (6,4) touches all of — two along its north
    // side, one on its east — and no other anchor touches more than two.
    const mission = field(
      12,
      [at(1, 4), at(6, 3), at(7, 3), at(8, 4)],
      at(3, 4),
    );
    const commands = plan(mission);
    const destination = destinationOf(mission, commands);
    const enemies = mission.units.filter((u) => u.team === "tdf");
    expect(adjacentCount(destination, enemies, SIZE)).toBe(3);
    expect(destination).toEqual(at(6, 4));
  });

  it("prefers two bodies in contact over one, even at a detour", () => {
    // The block at (4,3) touches the pair along its north side; the one
    // at (1,3) touches the straggler and is a step nearer the brute. The
    // pair must win.
    const mission = field(10, [at(0, 3), at(4, 2), at(5, 2)], at(2, 3));
    const destination = destinationOf(mission, plan(mission));
    expect(
      adjacentCount(
        destination,
        [unit(mission, "squad-2"), unit(mission, "squad-3")],
        SIZE,
      ),
    ).toBe(2);
  });

  it("walks off a straggler it is already touching to reach a crowd", () => {
    // The brute starts in contact with one soldier on its west side;
    // three more are clustered four anchor steps east, inside its
    // two-action reach. Punishing clumps means leaving.
    const mission = field(
      12,
      [at(2, 4), at(7, 3), at(8, 3), at(9, 4)],
      at(3, 4),
    );
    const commands = plan(mission);
    expect(commands.some((c) => c.type === MOVE)).toBe(true);
    const destination = destinationOf(mission, commands);
    const enemies = mission.units.filter((u) => u.team === "tdf");
    expect(destination).toEqual(at(7, 4));
    expect(adjacentCount(destination, enemies, SIZE)).toBe(3);
  });

  it("ignores cover: takes the open tile beside the crowd over shelter beside nobody", () => {
    // The block at (1,3) is walled on three sides — excellent cover, no
    // company. The block at (5,3) is bare ground touching two soldiers.
    const builder = new FixtureMapBuilder(10, 10, 2).fillGround();
    for (const x of [1, 2]) {
      builder.wall(at(x, 3), "n", "solid");
      builder.wall(at(x, 4), "s", "solid");
    }
    for (const z of [3, 4]) {
      builder.wall(at(1, z), "w", "solid");
    }
    const mission = field(10, [at(7, 3), at(6, 5)], at(3, 3), builder.build());
    const destination = destinationOf(mission, plan(mission));
    expect(destination).not.toEqual(at(1, 3));
    const enemies = mission.units.filter((u) => u.team === "tdf");
    expect(adjacentCount(destination, enemies, SIZE)).toBeGreaterThan(0);
  });

  it("soaks overwatch: walks into contact anyway with the guns trained on it", () => {
    // A lurker would price the watchers' line of fire as a cost and hang
    // back. The brute is armored and the shots it draws spend the
    // watchers' overwatch, so it must still close.
    const mission = field(10, [at(6, 4), at(6, 3), at(6, 5)], at(2, 4));
    const watched: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.team === "tdf" ? { ...u, status: ["overwatch" as const] } : u,
      ),
    };
    const enemies = watched.units.filter((u) => u.team === "tdf");
    const closed = destinationOf(watched, plan(watched));
    expect(adjacentCount(closed, enemies, SIZE)).toBeGreaterThan(0);

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
    expect(adjacentCount(fled, enemies, SIZE)).toBe(0);
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
    // The block at (5,3) is the only anchor touching both soldiers — one
    // off its north side, one off its south — and is two steps away, so
    // one action point is left to swing with.
    const mission = field(10, [at(6, 2), at(5, 5)], at(3, 3));
    const commands = plan(mission);
    expect(destinationOf(mission, commands)).toEqual(at(5, 3));
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
    // The block at (4,4) touches a pair two steps away; the one at (8,4)
    // touches three at the very end of the brute's reach.
    const mission = field(
      12,
      [at(5, 3), at(5, 6), at(8, 3), at(9, 3), at(10, 4)],
      at(2, 4),
    );
    const enemies = mission.units.filter((u) => u.team === "tdf");
    const destination = destinationOf(mission, plan(mission));
    expect(adjacentCount(destination, enemies, SIZE)).toBe(3);
  });

  it("consults its tuning: a brute repelled by contact keeps its distance", () => {
    // adjacentWeight is the knob the whole behaviour turns on. Invert it
    // and the same fixture must produce the opposite arrangement, which
    // no hard-coded preference for the crowd could fake.
    const mission = field(10, [at(6, 4), at(6, 3), at(6, 5)], at(3, 4));
    const shy = new BruteBehaviour({ ...BRUTE_TUNING, adjacentWeight: -5 });
    const enemies = mission.units.filter((u) => u.team === "tdf");
    expect(
      adjacentCount(
        destinationOf(mission, plan(mission, 1, shy)),
        enemies,
        SIZE,
      ),
    ).toBe(0);
    expect(
      adjacentCount(destinationOf(mission, plan(mission)), enemies, SIZE),
    ).toBeGreaterThan(0);
  });
});

// ===========================================
// Cutting through walls (#1130)
// ===========================================

/**
 * A 12×12 field with a walled 3×3 room over `x ∈ [6, 8], z ∈ [4, 6]`,
 * its west face made of `westWall`, and a soldier inside at (7,5). The
 * brute is anchored at (4,4), so its east tiles (5,4) and (5,5) stand
 * against the room's west wall with the soldier two tiles beyond.
 *
 * ```
 *   x:  4 5 │ 6 7 8 │
 *   z=4 B B │ . . . │      B  brute (2×2)
 *   z=5 B B │ . S . │      S  soldier
 *   z=6     │ . . . │      │  the west face: `westWall`
 * ```
 */
function walledRoom(westWall: WallKind): TacticalState {
  const builder = new FixtureMapBuilder(12, 12, 2).fillGround();
  for (const x of [6, 7, 8]) {
    builder.wall(at(x, 4), "n", "solid");
    builder.wall(at(x, 6), "s", "solid");
  }
  for (const z of [4, 5, 6]) {
    builder.wall(at(6, z), "w", westWall);
    builder.wall(at(8, z), "e", "solid");
  }
  const mission = missionWith(
    builder.build(),
    [unitAt("squad-1", "infantry", at(7, 5))],
    { phase: "player" },
  );
  return withBug(mission, BRUTE, at(4, 4), "brute-1").mission;
}

/** The shipped `EndTurn` over the brute alone, with the dice loaded to hit. */
function endTurnWithBrute(): ReturnType<typeof createEndTurnHandler> {
  const attackDeps = fixtureAttackDeps();
  const actions: TacticalHandlers = {
    [ATTACK]: createAttackHandler(COMBAT_TUNING, attackDeps),
    [MOVE]: createMoveHandler(
      createOverwatchReaction(COMBAT_TUNING, attackDeps),
    ),
  };
  return createEndTurnHandler(
    DEFAULT_PHASE_STEPS,
    createBugPhaseRunner({
      handlers: actions,
      registry: new MapBehaviourRegistry([new BruteBehaviour()]),
      speciesOf: createSpeciesLookup(BUG_SPECIES),
      combat: COMBAT_TUNING,
    }),
  );
}

/** One player `EndTurn`, which plays the bug phase in full and hands the turn back. */
function playBugPhase(mission: TacticalState): {
  state: TacticalState;
  types: readonly string[];
} {
  const outcome = endTurnWithBrute()(
    mission,
    endTurn(),
    ctxWith(riggedRng(true)),
  );
  if (!outcome.ok) throw new Error(`EndTurn refused: ${outcome.error.kind}`);
  return {
    state: outcome.value.state,
    types: outcome.value.events.map((e) => e.type),
  };
}

/** The wall on `side` of the tile, read from the map as it now stands. */
function wallOn(
  mission: TacticalState,
  tile: TileCoord,
  side: "n" | "e" | "s" | "w",
): WallKind | undefined {
  return new TileIndex(mission.map).getAt(tile)?.walls[side];
}

describe("BruteBehaviour cutting through walls (#1130)", () => {
  it("cuts the window it can see the squad through, then walks in and swings", () => {
    // The window lets the brute see the soldier and stops it walking
    // in; its four tiles fit through no door anyway. First phase: the
    // cleavers open the west face. Second phase: through the gap and
    // into contact.
    const start = walledRoom("window");
    expect(bugView(start).units.some((u) => u.team === "tdf")).toBe(true);
    expect(wallOn(start, at(6, 5), "w")).toBe("window");

    const first = playBugPhase(start);
    expect(first.types).toContain(BLAST_RESOLVED);
    expect(first.types).toContain(STRUCTURE_DESTROYED);
    expect(first.types).not.toContain(ATTACK_RESOLVED);
    expect(wallOn(first.state, at(6, 5), "w")).toBeUndefined();
    expect(wallOn(first.state, at(5, 5), "e")).toBeUndefined();
    // The soldier two tiles beyond the wall was not in the sweep.
    expect(unit(first.state, "squad-1").hp).toBe(10);

    const second = playBugPhase(first.state);
    const brute = unit(second.state, "brute-1");
    expect(brute.pos).toEqual(at(5, 4));
    expect(
      adjacentCount(brute.pos, [unit(second.state, "squad-1")], SIZE),
    ).toBe(1);
    expect(second.types).toContain(ATTACK_RESOLVED);
  });

  it("cuts a solid wall toward a squad it remembers but cannot see, then walks in", () => {
    // No window: the brute perceives nobody, but its side once saw the
    // soldier where it stands. The memory is enough to cut toward.
    const walled = walledRoom("solid");
    const start: TacticalState = {
      ...walled,
      vision: {
        ...walled.vision,
        bugs: { ...walled.vision.bugs, lastSeen: { "squad-1": at(7, 5) } },
      },
    };
    expect(bugView(start).units.some((u) => u.team === "tdf")).toBe(false);

    const first = playBugPhase(start);
    expect(first.types).toContain(STRUCTURE_DESTROYED);
    expect(wallOn(first.state, at(6, 5), "w")).toBeUndefined();
    expect(unit(first.state, "squad-1").hp).toBe(10);

    const second = playBugPhase(first.state);
    expect(unit(second.state, "brute-1").pos).toEqual(at(5, 4));
    expect(second.types).toContain(ATTACK_RESOLVED);
  });

  it("does not cut when nothing stands between it and the enemy, or when it remembers nobody", () => {
    // Open ground: the plan is a walk, never a shot at the grass.
    const open = field(12, [at(9, 5)], at(2, 4));
    expect(plan(open).map((c) => c.type)).toEqual([MOVE]);
    expect(
      breachTarget(open, unit(open, "brute-1").pos, SIZE, at(9, 5)),
    ).toBeUndefined();
    // A wall, but no enemy known on the far side: nothing to cut for.
    const walled = walledRoom("solid");
    const forgetful: TacticalState = {
      ...walled,
      units: walled.units.filter((u) => u.id !== "squad-1"),
    };
    expect(plan(forgetful)).toEqual([]);
  });

  it("only ever cuts toward the enemy, on the brute's own side of the wall", () => {
    const walled = walledRoom("solid");
    const brute = unit(walled, "brute-1");
    // The wall on the east edge of (5,5) is the one on the line to the
    // soldier: the shot is aimed at the brute's own tile, whose sweep
    // takes the wall on its edge.
    expect(breachTarget(walled, brute.pos, SIZE, at(7, 5))).toEqual(at(5, 5));
    // The same wall is behind the brute when the enemy is to the west,
    // so nothing is cut.
    expect(breachTarget(walled, brute.pos, SIZE, at(0, 5))).toBeUndefined();
  });

  it("cuts a prop that blocks the way as readily as a wall", () => {
    // A boulder is rock and never falls; a dumpster is in the catalogue
    // at force 2. The brute aims at the prop's own tile.
    const builder = new FixtureMapBuilder(10, 10, 2).fillGround();
    builder.prop("dumpster", at(6, 4));
    const mission = withBug(
      missionWith(builder.build(), [unitAt("squad-1", "infantry", at(8, 4))], {
        phase: "bugs",
      }),
      BRUTE,
      at(4, 4),
      "brute-1",
    ).mission;
    expect(
      breachTarget(mission, unit(mission, "brute-1").pos, SIZE, at(8, 4)),
    ).toEqual(at(6, 4));
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

  it("counts adjacency to any tile of a block, and never a tile inside it (#1130)", () => {
    // A 2×2 anchored at (5,4) holds (5,4), (6,4), (5,5), (6,5).
    const enemies = [
      unitAt("n-far-tile", "infantry", at(6, 3)),
      unitAt("e-far-tile", "infantry", at(7, 5)),
      unitAt("s", "infantry", at(5, 6)),
      unitAt("diagonal", "infantry", at(7, 3)),
      unitAt("two-off", "infantry", at(8, 4)),
      unitAt("above", "infantry", at(7, 4, 1)),
    ];
    expect(adjacentCount(at(5, 4), enemies, 2)).toBe(3);
    expect(adjacentCount(at(5, 4), enemies)).toBe(0);
  });
});

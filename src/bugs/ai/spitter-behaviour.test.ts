import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { CoverLevel } from "../../mapgen/model/cover";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { PropKindIds } from "../../mapgen/data/props";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import type { AttackCommand } from "../../tactical/model/attack-command";
import { ATTACK } from "../../tactical/model/attack-command";
import type { MoveCommand } from "../../tactical/model/move-command";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { validateAttack } from "../../tactical/service/combat-service";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import { coverAgainst } from "../../tactical/service/sight-service";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { attackDistance } from "../../tactical/service/weapon-reach-service";
import { SPITTER_TUNING } from "../data/spitter-tuning";
import { SPITTER, SWARMER } from "../data/species";
import type { BehaviourContext } from "./bug-behaviour";
import {
  bugView,
  startedMission,
  walkableTileNear,
  withBug,
} from "./bug-mission.test-helper";
import { SpitterBehaviour, besideAny } from "./spitter-behaviour";
import { reachableTiles } from "./utility";

// ===========================================
// Fixtures
// ===========================================

const ctx = (mission: TacticalState, seed: number): BehaviourContext => ({
  rng: new Mulberry32Rng(seed),
  combat: COMBAT_TUNING,
  graph: buildMoveGraph(mission.map),
});

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** Where the squad stands on the cover field. */
const MARK = at(6, 2);
/** Where the spitter starts: nine tiles south, out of its six-tile reach. */
const START = at(6, 11);
/** The one covered firing tile: a crate on its north edge, six tiles from the mark. */
const COVERED = at(7, 7);
/** The open firing tile a bare shot would take: six tiles out, the fewest steps. */
const OPEN = at(6, 8);

/**
 * A squad in the open to the north and a spitter to the south, out of
 * reach. One crate stands between them, so exactly one tile the spitter
 * can reach and still spit from is covered against the squad's return
 * fire. Every other firing tile is open, and the nearest of them
 * (`OPEN`) is three steps closer to home.
 *
 * ```
 *        x=6 7
 * z=2     M          M the squad (in the open)
 *  …
 * z=6       C        C crate: low cover, no block to sight
 * z=7       *        * COVERED: 5 steps, 6 tiles from M, crate to the north
 * z=8     o          o OPEN: 3 steps, 6 tiles from M, nothing near
 *  …
 * z=11    S          S the spitter
 * ```
 */
function coverField(): { mission: TacticalState; spitterId: string } {
  const map = new FixtureMapBuilder(13, 13, 1)
    .fillGround()
    .prop(PropKindIds.CRATE, at(7, 6))
    .build();
  const mark = unitAt("mark", "infantry", MARK);
  const base = missionWith(map, [mark], { phase: "bugs" });
  const { mission, bug } = withBug(base, SPITTER, START, "spitter");
  return { mission, spitterId: bug.id };
}

/** The tile a command list moves to, or undefined when it does not move. */
function destination(
  commands: readonly TacticalCommand[],
): TileCoord | undefined {
  const step = commands.find((c): c is MoveCommand => c.type === MOVE);
  return step?.payload.path.at(-1);
}

/** The target a command list attacks, or undefined when it does not. */
function targetOf(commands: readonly TacticalCommand[]): string | undefined {
  const shot = commands.find((c): c is AttackCommand => c.type === ATTACK);
  return shot?.payload.targetId;
}

// ===========================================
// Tests
// ===========================================

describe("SpitterBehaviour", () => {
  it("answers to the snipe tag, which is the spitter's", () => {
    expect(new SpitterBehaviour().tag).toBe(SPITTER.behaviour);
  });

  it("walks to the covered firing tile and spits, not to the open one a bare shot would take", () => {
    const { mission, spitterId } = coverField();
    // The premises the choice rests on, so a map-rule change cannot
    // quietly turn this into a test of something else.
    const view = bugView(mission);
    expect(view.units.map((u) => u.id)).toContain("mark");
    const reach = reachableTiles(mission, spitterId);
    for (const tile of [COVERED, OPEN]) {
      const entry = reach.find(
        (r) => r.tile.x === tile.x && r.tile.z === tile.z,
      );
      // Reachable on one action (move 5), leaving one to spit with.
      expect(entry?.steps).toBeLessThanOrEqual(SPITTER.move);
      expect(attackDistance(tile, MARK)).toBeLessThanOrEqual(
        SPITTER.weapon.range,
      );
    }
    expect(attackDistance(START, MARK)).toBeGreaterThan(SPITTER.weapon.range);
    expect(coverAgainst(mission.map, COVERED, MARK)).toBe(CoverLevel.LOW);
    expect(coverAgainst(mission.map, OPEN, MARK)).toBe(CoverLevel.NONE);

    for (let seed = 1; seed <= 8; seed++) {
      const commands = new SpitterBehaviour().choose(
        view,
        spitterId,
        ctx(mission, seed),
      );
      expect(commands.map((c) => c.type)).toEqual([MOVE, ATTACK]);
      expect(destination(commands)).toEqual(COVERED);
      expect(targetOf(commands)).toBe("mark");
    }

    // The control: the same bug with cover worth nothing takes the
    // open tile, three steps nearer, so the crate is what decided it.
    const careless = new SpitterBehaviour({
      ...SPITTER_TUNING,
      coverWeight: 0,
    });
    const bare = careless.choose(view, spitterId, ctx(mission, 1));
    expect(destination(bare)).toEqual(OPEN);
  });

  it("holds a covered firing tile and spits from it", () => {
    const map = new FixtureMapBuilder(13, 13, 1)
      .fillGround()
      .prop(PropKindIds.CRATE, at(7, 6))
      .build();
    const base = missionWith(map, [unitAt("mark", "infantry", MARK)], {
      phase: "bugs",
    });
    const { mission, bug } = withBug(base, SPITTER, COVERED, "spitter");
    for (let seed = 1; seed <= 4; seed++) {
      const commands = new SpitterBehaviour().choose(
        bugView(mission),
        bug.id,
        ctx(mission, seed),
      );
      expect(commands).toEqual([
        { type: ATTACK, payload: { attackerId: bug.id, targetId: "mark" } },
      ]);
    }
  });

  it("backs off from a squad beside it before it spits, and never ends beside one", () => {
    // Open ground: nothing but distance to choose by, and point-blank is
    // the best hit chance on the map, so only the rule moves it.
    const map = new FixtureMapBuilder(13, 13, 1).fillGround().build();
    const mark = unitAt("mark", "infantry", at(6, 5));
    const base = missionWith(map, [mark], { phase: "bugs" });
    const { mission, bug } = withBug(base, SPITTER, at(6, 6), "spitter");
    expect(besideAny(bug.pos, [mark])).toBe(true);
    for (let seed = 1; seed <= 8; seed++) {
      const commands = new SpitterBehaviour().choose(
        bugView(mission),
        bug.id,
        ctx(mission, seed),
      );
      expect(commands.map((c) => c.type)).toEqual([MOVE, ATTACK]);
      const end = destination(commands)!;
      expect(besideAny(end, [mark])).toBe(false);
      expect(attackDistance(end, mark.pos)).toBeLessThanOrEqual(
        SPITTER.weapon.range,
      );
      expect(targetOf(commands)).toBe("mark");
    }
  });

  it("holds and spits when boxed in beside a squad with nowhere clear to go", () => {
    // Walled into a one-tile pocket with the squad in its doorway.
    const builder = new FixtureMapBuilder(5, 5, 1).fillGround();
    const pocket = at(2, 2);
    builder.wall(pocket, "w", "solid");
    builder.wall(pocket, "e", "solid");
    builder.wall(pocket, "s", "solid");
    const mark = unitAt("mark", "infantry", at(2, 1));
    const base = missionWith(builder.build(), [mark], { phase: "bugs" });
    const { mission, bug } = withBug(base, SPITTER, pocket, "spitter");
    expect(reachableTiles(mission, bug.id)).toEqual([]);
    const commands = new SpitterBehaviour().choose(
      bugView(mission),
      bug.id,
      ctx(mission, 1),
    );
    expect(commands.map((c) => c.type)).toEqual([ATTACK]);
    expect(targetOf(commands)).toBe("mark");
  });

  it("closes on a squad out of reach without spending its spit on nothing", () => {
    // On its own a spitter sees ten tiles and moves five and spits six,
    // so whatever it sees it can shoot. Here a swarmer spots the squad
    // for the swarm fourteen tiles from the spitter: out of reach even
    // after a move, so the turn is a dash and nothing else.
    const map = new FixtureMapBuilder(20, 13, 1).fillGround().build();
    const mark = unitAt("mark", "infantry", at(1, 6));
    const base = missionWith(map, [mark], { phase: "bugs" });
    const spotted = withBug(base, SWARMER, at(4, 6), "spotter");
    const { mission, bug } = withBug(
      spotted.mission,
      SPITTER,
      at(15, 6),
      "spitter",
    );
    expect(bugView(mission).units.map((u) => u.id)).toContain("mark");
    expect(attackDistance(bug.pos, mark.pos)).toBeGreaterThan(
      SPITTER.move + SPITTER.weapon.range,
    );
    const commands = new SpitterBehaviour().choose(
      bugView(mission),
      bug.id,
      ctx(mission, 3),
    );
    expect(commands.map((c) => c.type)).toEqual([MOVE]);
    const end = destination(commands)!;
    // A dash: both actions, so it ends further on than one move reaches.
    expect(attackDistance(bug.pos, end)).toBeGreaterThan(SPITTER.move);
    expect(attackDistance(end, mark.pos)).toBeLessThan(
      attackDistance(bug.pos, mark.pos),
    );
  });

  it("hunts rather than holding when it perceives no enemy, and a dead spitter does nothing", () => {
    const base = startedMission("bugs");
    const noEnemies = {
      ...base,
      units: base.units.filter((u) => u.team !== "tdf"),
    };
    const { mission, bug } = withBug(
      noEnemies,
      SPITTER,
      walkableTileNear(noEnemies, { x: 1, y: 0, z: 1 }),
    );
    const spitter = new SpitterBehaviour();
    const hunting = spitter.choose(bugView(mission), bug.id, ctx(mission, 1));
    expect(hunting.map((c) => c.type)).toEqual([MOVE]);

    const dead = {
      ...mission,
      units: mission.units.map((u) => (u.id === bug.id ? { ...u, hp: 0 } : u)),
    };
    expect(spitter.choose(bugView(dead), bug.id, ctx(dead, 1))).toEqual([]);
  });
});

describe("the spit answers to cover (#446)", () => {
  it("is held to the target's cover like any ranged shot, so a crate is worth hiding behind", () => {
    // Two squads five tiles from the spitter, one behind a crate and one
    // in the open. Melee ignores cover (#446), so until the spitter no
    // bug's attack ever read this number; the spit reads it like a rifle.
    const map = new FixtureMapBuilder(9, 9, 1)
      .fillGround()
      .prop(PropKindIds.CRATE, at(4, 5))
      .build();
    const hidden = unitAt("hidden", "infantry", at(4, 6));
    const exposed = unitAt("exposed", "infantry", at(6, 4));
    const base = missionWith(map, [hidden, exposed], { phase: "bugs" });
    const { mission } = withBug(base, SPITTER, at(4, 1), "spitter");
    const intoCover = validateAttack(
      mission,
      "spitter",
      "hidden",
      COMBAT_TUNING,
    );
    const intoOpen = validateAttack(
      mission,
      "spitter",
      "exposed",
      COMBAT_TUNING,
    );
    expect(intoCover.ok && intoCover.value.terrain.distance).toBe(5);
    expect(intoOpen.ok && intoOpen.value.terrain.distance).toBe(5);
    expect(intoCover.ok && intoCover.value.terrain.cover).toBe(CoverLevel.LOW);
    expect(intoOpen.ok && intoOpen.value.terrain.cover).toBe(CoverLevel.NONE);
  });
});

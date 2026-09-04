import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { PropKindIds } from "../../mapgen/data/props";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { MoveCommand } from "../../tactical/model/move-command";
import type { LurkerTuning } from "../model/lurker-tuning";
import { LURKER } from "../data/species";
import { LURKER_TUNING } from "../data/lurker-tuning";
import type { BehaviourContext } from "./bug-behaviour";
import { LurkerBehaviour, tileBehind } from "./lurker-behaviour";
import {
  applyMoveTo,
  startedMission,
  walkableTileNear,
  withBug,
  bugView,
} from "./bug-mission.test-helper";
import { exposureScore, tileDistance } from "./utility";

// ===========================================
// Fixtures
// ===========================================

const ctx = (mission: TacticalState, seed: number): BehaviourContext => ({
  rng: new Mulberry32Rng(seed),
  combat: COMBAT_TUNING,
  graph: buildMoveGraph(mission.map),
});

/** Runs up to `turns` lurker turns from `start`, returning where it ends and whether it attacked. */
function stalk(
  start: TacticalState,
  bugId: string,
  seed: number,
  turns: number,
): { end: Unit; attacked: boolean; moved: number } {
  const lurker = new LurkerBehaviour();
  let mission = start;
  let attacked = false;
  let moved = 0;
  for (let turn = 0; turn < turns; turn++) {
    const commands = lurker.choose(
      bugView(mission),
      bugId,
      ctx(mission, seed * 31 + turn),
    );
    for (const command of commands) {
      if (command.type === MOVE) {
        mission = applyMoveTo(mission, bugId, command.payload.path);
        moved++;
      }
      if (command.type === ATTACK) {
        attacked = true;
      }
    }
    if (attacked) break;
  }
  return { end: mission.units.find((u) => u.id === bugId)!, attacked, moved };
}

/** "Behind" means on the tile opposite the mark's facing; "front" the tile it faces. */
function relation(bug: Unit, mark: Unit): "behind" | "front" | "side" | "away" {
  if (tileDistance(bug.pos, mark.pos) !== 1) return "away";
  const behind = tileBehind(mark);
  if (bug.pos.x === behind.x && bug.pos.z === behind.z) return "behind";
  const front = { x: 2 * mark.pos.x - behind.x, z: 2 * mark.pos.z - behind.z };
  if (bug.pos.x === front.x && bug.pos.z === front.z) return "front";
  return "side";
}

// ===========================================
// Tests
// ===========================================

describe("LurkerBehaviour", () => {
  it("ends adjacent-behind its mark more often than in front across a seed sweep on a cover map", () => {
    const base = startedMission("bugs");
    const squads = base.units.filter((u) => u.kind === "squad");
    expect(squads.length).toBeGreaterThan(0);
    const tally = { behind: 0, front: 0, side: 0, away: 0 };
    let attacks = 0;
    const seeds = 24;
    for (let seed = 0; seed < seeds; seed++) {
      // Start the lurker a few tiles off, alternating sides, on the ground level.
      const mark = squads[seed % squads.length]!;
      const dx = seed % 2 === 0 ? 4 : -4;
      const dz = seed % 3 === 0 ? 3 : -3;
      const start = walkableTileNear(base, {
        x: Math.min(base.map.width - 1, Math.max(0, mark.pos.x + dx)),
        y: mark.pos.y,
        z: Math.min(base.map.depth - 1, Math.max(0, mark.pos.z + dz)),
      });
      const { mission, bug } = withBug(base, LURKER, start);
      const result = stalk(mission, bug.id, seed, 4);
      const nearest = squads
        .map((s) => ({ s, d: tileDistance(result.end.pos, s.pos) }))
        .sort((a, b) => a.d - b.d)[0]!.s;
      tally[relation(result.end, nearest)]++;
      if (result.attacked) attacks++;
    }
    expect(tally.behind + tally.side + tally.front + tally.away).toBe(seeds);
    expect(tally.behind).toBeGreaterThan(tally.front);
    expect(attacks).toBeGreaterThan(0);
  });

  it("attacks from where it stands when already flanking, and never into an un-flanked front with cover", () => {
    const base = startedMission("bugs");
    const mark = base.units.find((u) => u.kind === "squad")!;
    const behind = walkableTileNear(base, tileBehind(mark));
    const { mission, bug } = withBug(base, LURKER, behind);
    const lurker = new LurkerBehaviour();
    const commands = lurker.choose(bugView(mission), bug.id, ctx(mission, 1));
    // Standing behind the mark: either it attacks now, or the map gives the
    // mark no cover on any side and it still attacks (nothing to flank).
    expect(commands.length).toBeGreaterThan(0);
    const last = commands.at(-1)!;
    expect([ATTACK, MOVE]).toContain(last.type);
  });

  it("hunts rather than holding when it perceives no enemy, and ignores dead lurkers", () => {
    // It used to hold still here. Since #559 a bug with nothing in view
    // works toward the landing zone instead, because a player who never
    // walks into its sight was never attacked at all.
    const base = startedMission("bugs");
    const noEnemies = {
      ...base,
      units: base.units.filter((u) => u.team !== "tdf"),
    };
    const { mission, bug } = withBug(
      noEnemies,
      LURKER,
      walkableTileNear(noEnemies, { x: 1, y: 0, z: 1 }),
    );
    const lurker = new LurkerBehaviour();
    const hunting = lurker.choose(bugView(mission), bug.id, ctx(mission, 1));
    expect(hunting.length).toBeGreaterThan(0);
    expect(hunting[0]?.type).toBe(MOVE);

    // A dead lurker still does nothing at all.
    const dead = {
      ...mission,
      units: mission.units.map((u) => (u.id === bug.id ? { ...u, hp: 0 } : u)),
    };
    expect(lurker.choose(bugView(dead), bug.id, ctx(dead, 1))).toEqual([]);
  });
});

// ===========================================
// Melee and cover (#446)
// ===========================================

describe("LurkerBehaviour against a mark in cover", () => {
  /**
   * A lurker standing next to a squad that has a crate on one side, so
   * `markHasAnyCover` is true and — since #446 — the terrain can never
   * report the melee attacker as flanking.
   */
  function besideCoveredMark() {
    const map = new FixtureMapBuilder(9, 9, 1)
      .fillGround()
      .prop(PropKindIds.CRATE, { x: 4, y: 0, z: 3 })
      .build();
    const squad = unitAt("squad-1", "infantry", { x: 4, y: 0, z: 4 });
    const base = missionWith(map, [squad], { phase: "bugs" });
    return withBug(base, LURKER, { x: 5, y: 0, z: 4 }, "lurker-1").mission;
  }

  it("strikes instead of circling, because flanking a melee target buys nothing (#446)", () => {
    // Before #446 this lurker waited for a flank that a melee weapon can
    // never get. The rule removed the bonus; the behaviour has to stop
    // holding out for it or it circles a covered mark forever.
    const mission = besideCoveredMark();
    const commands = new LurkerBehaviour().choose(
      bugView(mission),
      "lurker-1",
      ctx(mission, 1),
    );
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.at(-1)?.type).toBe(ATTACK);
    expect(commands.at(-1)?.payload).toMatchObject({ targetId: "squad-1" });
  });
});

// ===========================================
// Dead ground, on a field wider than a sight range
// ===========================================

/**
 * The gap #676 named: every lurker fixture until now sat inside one
 * sight range, and a term that is constant across every test board is
 * indistinguishable from a term that is constant everywhere — which is
 * exactly how `exposureScore` reading `1` on every tile of the map
 * survived until #669.
 *
 * So this field is 40 wide against the fixture templates' `sightRange`
 * of 8, and the mark's friend stands far enough from the mark that the
 * tiles the lurker can reach straddle the edge of what that friend
 * sees:
 *
 * ```
 *   x:      20            28        34
 *            M   . . . . . L . . . F      M mark   F friend   L lurker
 *            └ seen by M ─┘ └ seen by both ┘
 *   exposure  0.5           1.0        0.5
 * ```
 *
 * Three values on one board rather than two, because `others` counts
 * the mark as well as its friend: the middle is watched by both, either
 * flank by one, and the far west by neither.
 */
/** The lurker's plan under the given tuning. */
function planWith(
  mission: TacticalState,
  tuning: LurkerTuning,
): readonly TacticalCommand[] {
  return new LurkerBehaviour(tuning).choose(
    bugView(mission),
    "lurker-1",
    ctx(mission, 1),
  );
}

/** Where the plan puts the lurker, or where it already stands. */
function destinationOf(
  mission: TacticalState,
  commands: readonly TacticalCommand[],
): TileCoord {
  const step = commands.find((c): c is MoveCommand => c.type === MOVE);
  return (
    step?.payload.path.at(-1) ??
    mission.units.find((u) => u.id === "lurker-1")!.pos
  );
}

function acrossSightEdge(): TacticalState {
  const map = new FixtureMapBuilder(40, 9, 1).fillGround().build();
  const mark = unitAt("squad-1", "infantry", { x: 20, y: 0, z: 4 });
  const friend = unitAt("squad-2", "infantry", { x: 34, y: 0, z: 4 });
  const base = missionWith(map, [mark, friend], { phase: "bugs" });
  return withBug(base, LURKER, { x: 28, y: 0, z: 4 }, "lurker-1").mission;
}

describe("LurkerBehaviour across a sight edge (#676)", () => {
  it("has tiles the lurker can reach on both sides of what the friend sees", () => {
    // The fixture's own precondition. Without this the test below could
    // pass on a board where the term never varies, which is the defect
    // it exists to rule out rather than a detail of the setup.
    const mission = acrossSightEdge();
    const index = new TileIndex(mission.map);
    const others = mission.units.filter((u) => u.team === "tdf");
    const score = (x: number): number =>
      exposureScore(mission, { x, y: 0, z: 4 }, others, index);
    // Three distinct values on one board, which is the whole point: both
    // of them see the middle, only the mark sees the near side, and
    // neither reaches the far west.
    expect(score(27)).toBe(1);
    expect(score(22)).toBe(0.5);
    expect(score(5)).toBe(0);
  });

  it("consults its tuning: a lurker that likes being watched crosses into view", () => {
    // Flip the sign and the same fixture must produce the opposite
    // arrangement. This is the assertion that could not exist while the
    // score read 1 everywhere: no weight could move a constant.
    const mission = acrossSightEdge();
    const index = new TileIndex(mission.map);
    const others = mission.units.filter((u) => u.team === "tdf");
    const hidden = destinationOf(mission, planWith(mission, LURKER_TUNING));
    const bold = destinationOf(
      mission,
      planWith(mission, { ...LURKER_TUNING, exposureWeight: -6 }),
    );
    expect(exposureScore(mission, bold, others, index)).toBeGreaterThan(
      exposureScore(mission, hidden, others, index),
    );
  });
});

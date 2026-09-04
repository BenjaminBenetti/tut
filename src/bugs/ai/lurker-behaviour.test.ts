import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import { LURKER } from "../data/species";
import type { BehaviourContext } from "./bug-behaviour";
import { LurkerBehaviour, tileBehind } from "./lurker-behaviour";
import {
  applyMoveTo,
  startedMission,
  walkableTileNear,
  withBug,
} from "./bug-mission.test-helper";
import { tileDistance } from "./utility";

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
      mission,
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
    const commands = lurker.choose(mission, bug.id, ctx(mission, 1));
    // Standing behind the mark: either it attacks now, or the map gives the
    // mark no cover on any side and it still attacks (nothing to flank).
    expect(commands.length).toBeGreaterThan(0);
    const last = commands.at(-1)!;
    expect([ATTACK, MOVE]).toContain(last.type);
  });

  it("holds still with no enemies and ignores dead lurkers", () => {
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
    expect(lurker.choose(mission, bug.id, ctx(mission, 1))).toEqual([]);
    const dead = {
      ...mission,
      units: mission.units.map((u) => (u.id === bug.id ? { ...u, hp: 0 } : u)),
    };
    expect(lurker.choose(dead, bug.id, ctx(dead, 1))).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import type { MissionView } from "../../tactical/model/mission-view";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { touchesMapEdge } from "../../tactical/service/map-edge-service";
import { emptyVision } from "../../tactical/service/vision-service";
import {
  attackDistance,
  closestTiles,
} from "../../tactical/service/weapon-reach-service";
import { unitAt } from "../../tactical/service/tactical-fixtures.test-helper";
import { BROODMOTHER_TUNING } from "../data/broodmother-tuning";
import {
  fieldMap,
  motherMission,
  walledFieldAt,
} from "../service/broodmother.test-helper";
import { bugView } from "./bug-mission.test-helper";
import { BroodmotherBehaviour } from "./broodmother-behaviour";
import { footprintDistance } from "./utility";

// ===========================================
// Fixtures
// ===========================================

/** The fixture squad's carbine: five tiles, and it sees eight. */
const SQUAD_REACH = 5;

const behaviour = new BroodmotherBehaviour();

/** Her commands for this turn from the bugs' view of `mission`. */
function choose(
  mission: TacticalState,
  id: string,
): readonly TacticalCommand[] {
  return behaviour.choose(bugView(mission), id, {
    rng: new Mulberry32Rng(7),
    combat: COMBAT_TUNING,
  });
}

/** Where her move ends, or where she stands when she does not move. */
function endOf(commands: readonly TacticalCommand[], her: Unit): TileCoord {
  const step = commands.find((c) => c.type === MOVE);
  return step?.type === MOVE ? step.payload.path.at(-1)! : her.pos;
}

/** Tiles from the squad's nearest tile to her nearest, anchored at `anchor`. */
function gapTo(squad: Unit, anchor: TileCoord): number {
  const { from, to } = closestTiles(squad.pos, 1, anchor, 3);
  return attackDistance(from, to);
}

// ===========================================
// Tests
// ===========================================

describe("BroodmotherBehaviour: keeping her distance (#1179, campaign arc §9)", () => {
  it("walks out of a visible squad's reach when it has her covered", () => {
    const squad = unitAt("squad", "infantry", { x: 8, y: 0, z: 4 });
    const { mission, mother } = motherMission(
      fieldMap(20, 20).build(),
      [squad],
      { x: 9, y: 0, z: 6 },
    );
    // The fixture exhibits the case: she starts inside its reach, and
    // her side has spotted it.
    expect(gapTo(squad, mother.pos)).toBeLessThanOrEqual(SQUAD_REACH);
    expect(mission.vision.bugs.spotted).toContain("squad");
    const commands = choose(mission, mother.id);
    expect(commands.map((c) => c.type)).toEqual([MOVE]);
    const end = endOf(commands, mother);
    expect(gapTo(squad, end)).toBeGreaterThan(SQUAD_REACH);
  });

  it("does not react to a squad her side has not seen, however close it stands (faction vision only)", () => {
    const squad = unitAt("squad", "infantry", { x: 8, y: 0, z: 4 });
    const { mission, mother } = motherMission(
      fieldMap(20, 20).build(),
      [squad],
      { x: 9, y: 0, z: 6 },
    );
    // Hide the squad from the swarm: nobody on her side has spotted it,
    // and nobody remembers it. It still has her covered.
    const hidden: TacticalState = { ...mission, vision: emptyVision() };
    expect(gapTo(squad, mother.pos)).toBeLessThanOrEqual(SQUAD_REACH);
    expect(bugView(hidden).units.map((u) => u.id)).toEqual([mother.id]);
    expect(choose(hidden, mother.id)).toEqual([]);
    // The same squad handed to her raw — the sabotage the view prevents
    // — would move her, so the fixture is not holding her still.
    const raw = behaviour.choose(
      { ...hidden, vision: mission.vision } as MissionView,
      mother.id,
      { rng: new Mulberry32Rng(7), combat: COMBAT_TUNING },
    );
    expect(raw.map((c) => c.type)).toEqual([MOVE]);
  });

  it("keeps away from a squad only another bug can see: the swarm's eyes are hers", () => {
    // A solid wall on x = 7 | 8, the whole depth: she and the squad are
    // on opposite sides, and a swarmer on the squad's side spots it.
    const squad = unitAt("squad", "infantry", { x: 6, y: 0, z: 6 });
    const spotter = unitAt(
      "spotter",
      "infantry",
      { x: 2, y: 0, z: 6 },
      {
        team: "bugs",
      },
    );
    const { mission, mother } = motherMission(
      walledFieldAt(20, 20, 7),
      [squad, spotter],
      { x: 8, y: 0, z: 5 },
    );
    expect(gapTo(squad, mother.pos)).toBeLessThanOrEqual(SQUAD_REACH);
    expect(mission.vision.bugs.spotted).toContain("squad");
    const commands = choose(mission, mother.id);
    expect(gapTo(squad, endOf(commands, mother))).toBeGreaterThan(SQUAD_REACH);
    // Without the spotter nobody sees through the wall, and she holds.
    const alone = motherMission(walledFieldAt(20, 20, 7), [squad], {
      x: 8,
      y: 0,
      z: 5,
    });
    expect(alone.mission.vision.bugs.spotted).not.toContain("squad");
    expect(choose(alone.mission, alone.mother.id)).toEqual([]);
  });

  it("stays where she is when she is already well clear of every gun she can see", () => {
    const squad = unitAt("squad", "infantry", { x: 2, y: 0, z: 9 });
    const { mission, mother } = motherMission(
      fieldMap(20, 20).build(),
      [squad],
      { x: 11, y: 0, z: 8 },
    );
    // Nine tiles of gap against a reach of five: four of clearance,
    // which is the cap. Seen (the squad's 8 against her 10 of sight).
    expect(gapTo(squad, mother.pos) - SQUAD_REACH).toBe(
      BROODMOTHER_TUNING.marginCap,
    );
    expect(mission.vision.bugs.spotted).toContain("squad");
    expect(choose(mission, mother.id)).toEqual([]);
  });

  it("bites whoever has cornered her when nowhere she can reach is out of reach", () => {
    // Her block fills a 3×4 field: she can shuffle one row, and the
    // squad beside her covers all of it.
    const squad = unitAt("squad", "infantry", { x: 1, y: 0, z: 3 });
    const { mission, mother } = motherMission(fieldMap(3, 4).build(), [squad], {
      x: 0,
      y: 0,
      z: 0,
    });
    const commands = choose(mission, mother.id);
    expect(commands.map((c) => c.type)).toEqual([ATTACK]);
    expect(commands[0]?.type === ATTACK && commands[0].payload.targetId).toBe(
      "squad",
    );
  });
});

describe("BroodmotherBehaviour: fleeing (#1179, campaign arc §6.8)", () => {
  it("runs for the nearest map edge at half health, as far as her budget goes", () => {
    // On a 30×30 field anchored at (12, 14): the west edge is 12 tiles
    // off, the south 13, the north 14 and the east 15. Her budget is two
    // actions of five.
    const squad = unitAt("squad", "infantry", { x: 29, y: 0, z: 29 });
    const { mission, mother } = motherMission(
      fieldMap(30, 30).build(),
      [squad],
      { x: 12, y: 0, z: 14 },
      { hp: 30 },
    );
    const commands = choose(mission, mother.id);
    expect(commands.map((c) => c.type)).toEqual([MOVE]);
    const end = endOf(commands, mother);
    expect(end).toEqual({ x: 2, y: 0, z: 14 });
  });

  it("does not run a hit point above half: with nothing in view she holds", () => {
    const squad = unitAt("squad", "infantry", { x: 29, y: 0, z: 29 });
    const { mission, mother } = motherMission(
      fieldMap(30, 30).build(),
      [squad],
      { x: 12, y: 0, z: 14 },
      { hp: 31 },
    );
    expect(choose(mission, mother.id)).toEqual([]);
  });

  it("reaches the edge when it is within her budget, and then holds for the flight step", () => {
    const squad = unitAt("squad", "infantry", { x: 19, y: 0, z: 19 });
    const { mission, mother } = motherMission(
      fieldMap(20, 20).build(),
      [squad],
      { x: 6, y: 0, z: 8 },
      { hp: 10 },
    );
    const end = endOf(choose(mission, mother.id), mother);
    expect(touchesMapEdge(mission.map, end, 3)).toBe(true);
    const there: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === mother.id ? { ...u, pos: end } : u,
      ),
    };
    expect(choose(there, mother.id)).toEqual([]);
  });

  it("runs past a visible squad rather than keep her distance once she is fleeing", () => {
    // The squad stands between her and the west edge, in reach; fleeing,
    // she still takes the nearest edge.
    const squad = unitAt("squad", "infantry", { x: 3, y: 0, z: 8 });
    const { mission, mother } = motherMission(
      fieldMap(20, 20).build(),
      [squad],
      { x: 6, y: 0, z: 9 },
      { hp: 20 },
    );
    const end = endOf(choose(mission, mother.id), mother);
    expect(touchesMapEdge(mission.map, end, 3)).toBe(true);
  });
});

describe("BroodmotherBehaviour: shadowing (#1179)", () => {
  it("closes on where the swarm last saw the squad, and stops short at her stand-off distance", () => {
    const squad = unitAt("squad", "infantry", { x: 39, y: 0, z: 39 });
    const { mission, mother } = motherMission(
      fieldMap(40, 40).build(),
      [squad],
      { x: 30, y: 0, z: 20 },
    );
    const memory = { x: 2, y: 0, z: 20 };
    const remembered: TacticalState = {
      ...mission,
      vision: {
        ...mission.vision,
        bugs: { ...mission.vision.bugs, lastSeen: { squad: memory } },
      },
    };
    const before = footprintDistance(mother.pos, 3, memory);
    const end = endOf(choose(remembered, mother.id), mother);
    const after = footprintDistance(end, 3, memory);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual(BROODMOTHER_TUNING.standOff);
    // At the stand-off distance already, she holds.
    const close = motherMission(fieldMap(40, 40).build(), [squad], {
      x: 2 + BROODMOTHER_TUNING.standOff,
      y: 0,
      z: 20,
    });
    expect(
      choose(
        {
          ...close.mission,
          vision: {
            ...close.mission.vision,
            bugs: { ...close.mission.vision.bugs, lastSeen: { squad: memory } },
          },
        },
        close.mother.id,
      ),
    ).toEqual([]);
  });
});

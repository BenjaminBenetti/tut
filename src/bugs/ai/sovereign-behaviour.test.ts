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
import { emptyVision } from "../../tactical/service/vision-service";
import { unitAt } from "../../tactical/service/tactical-fixtures.test-helper";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import { fieldMap, walledFieldAt } from "../service/broodmother.test-helper";
import { groundGap } from "../service/sovereign-service";
import { sovereignMission } from "../service/sovereign.test-helper";
import { bugView } from "./bug-mission.test-helper";
import { SovereignBehaviour } from "./sovereign-behaviour";
import { footprintDistance } from "./utility";

// ===========================================
// Fixtures
// ===========================================

/** Her anchor: her block covers x 10–13, z 10–13. */
const ANCHOR = { x: 10, y: 0, z: 10 };

const behaviour = new SovereignBehaviour();

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

/** The unit a command strikes, if it is a strike at a unit. */
function struck(commands: readonly TacticalCommand[]): string | undefined {
  const blow = commands.find((c) => c.type === ATTACK);
  return blow?.type === ATTACK ? blow.payload.targetId : undefined;
}

/** A squad of the fixture's kind at `x`, `z` on the ground. */
function squadAt(id: string, x: number, z: number): Unit {
  return unitAt(id, "infantry", { x, y: 0, z });
}

/** A bug of the fixture's kind at `x`, `z`: a pair of the swarm's eyes. */
function spotterAt(id: string, x: number, z: number): Unit {
  return unitAt(id, "infantry", { x, y: 0, z }, { team: "bugs" });
}

// ===========================================
// Tests
// ===========================================

describe("SovereignBehaviour: engaging (#1179, campaign arc §9)", () => {
  it("walks up to a visible squad and cuts it down in the same turn", () => {
    const squad = squadAt("squad", 18, 11);
    const { mission, sovereign } = sovereignMission(
      fieldMap(30, 30).build(),
      [squad],
      ANCHOR,
    );
    // The fixture exhibits the case: five tiles off, spotted.
    expect(groundGap(sovereign.pos, 4, squad.pos, 1)).toBe(5);
    expect(mission.vision.bugs.spotted).toContain("squad");
    const commands = choose(mission, sovereign.id);
    expect(commands.map((c) => c.type)).toEqual([MOVE, ATTACK]);
    expect(groundGap(endOf(commands, sovereign), 4, squad.pos, 1)).toBe(1);
    expect(struck(commands)).toBe("squad");
  });

  it("strikes whoever stands beside her without moving", () => {
    const squad = squadAt("squad", 14, 11);
    const { mission, sovereign } = sovereignMission(
      fieldMap(30, 30).build(),
      [squad],
      ANCHOR,
    );
    const commands = choose(mission, sovereign.id);
    expect(commands.map((c) => c.type)).toEqual([ATTACK]);
    expect(struck(commands)).toBe("squad");
  });

  it("closes on the visible enemy nearest the core she guards, not the one nearest her", () => {
    // The core lies west. One squad is 8 tiles east of her, the other 9
    // west, beside the core: neither is in reach this turn.
    const east = squadAt("east", 21, 11);
    const west = squadAt("west", 1, 11);
    const core = { x: 2, y: 0, z: 11 };
    const { mission, sovereign } = sovereignMission(
      fieldMap(30, 30).build(),
      [east, west],
      ANCHOR,
      { core },
    );
    expect(mission.vision.bugs.spotted).toEqual(
      expect.arrayContaining(["east", "west"]),
    );
    expect(groundGap(sovereign.pos, 4, east.pos, 1)).toBeLessThan(
      groundGap(sovereign.pos, 4, west.pos, 1),
    );
    const end = endOf(choose(mission, sovereign.id), sovereign);
    expect(end.x).toBeLessThan(sovereign.pos.x);
  });

  it("never ranges past her leash from the core to chase a squad the swarm can see", () => {
    // The squad is far east, seen by a swarmer beside it; the core is
    // 4 tiles west of her, so her leash ends 4 tiles east of where she
    // stands — half of the 8 her legs would carry her.
    const squad = squadAt("squad", 27, 11);
    const spotter = spotterAt("spotter", 26, 12);
    const core = { x: 6, y: 0, z: 11 };
    const { mission, sovereign } = sovereignMission(
      fieldMap(30, 30).build(),
      [squad, spotter],
      ANCHOR,
      { core },
    );
    expect(mission.vision.bugs.spotted).toContain("squad");
    expect(footprintDistance(ANCHOR, 4, core)).toBe(4);
    const end = endOf(choose(mission, sovereign.id), sovereign);
    expect(end.x).toBeGreaterThan(sovereign.pos.x);
    expect(footprintDistance(end, 4, core)).toBeLessThanOrEqual(
      SOVEREIGN_TUNING.leashRadius,
    );
  });

  it("cuts the wall between her and a squad only the swarm can see, when nothing is in reach", () => {
    // A solid wall along her block's east edge, the whole depth; the
    // squad beyond it is spotted by a swarmer on its side.
    const squad = squadAt("squad", 16, 11);
    const spotter = spotterAt("spotter", 17, 12);
    const { mission, sovereign } = sovereignMission(
      walledFieldAt(30, 30, 13),
      [squad, spotter],
      ANCHOR,
    );
    expect(mission.vision.bugs.spotted).toContain("squad");
    const commands = choose(mission, sovereign.id);
    const cut = commands.find((c) => c.type === ATTACK);
    expect(cut?.type === ATTACK ? cut.payload.tile : undefined).toBeDefined();
    const tile = cut?.type === ATTACK ? cut.payload.tile : undefined;
    // She swings at her own east edge, where the wall stands.
    expect(tile?.x).toBe(13);
  });
});

describe("SovereignBehaviour: the retreat to the core (#1179, campaign arc §9)", () => {
  /** 40 % of her 120 hit points at difficulty 1. */
  const RETREAT_HP = 48;

  it("at the threshold walks back onto the core instead of striking the squad beside her", () => {
    const squad = squadAt("squad", 14, 11);
    const core = { x: 2, y: 0, z: 11 };
    const { mission, sovereign } = sovereignMission(
      fieldMap(30, 30).build(),
      [squad],
      ANCHOR,
      { core, hp: RETREAT_HP },
    );
    expect(footprintDistance(sovereign.pos, 4, core)).toBeGreaterThan(
      SOVEREIGN_TUNING.holdRadius,
    );
    const commands = choose(mission, sovereign.id);
    expect(commands.map((c) => c.type)).toEqual([MOVE]);
    expect(
      footprintDistance(endOf(commands, sovereign), 4, core),
    ).toBeLessThanOrEqual(SOVEREIGN_TUNING.holdRadius);
  });

  it("a point above the threshold she strikes it where she stands", () => {
    const squad = squadAt("squad", 14, 11);
    const core = { x: 2, y: 0, z: 11 };
    const { mission, sovereign } = sovereignMission(
      fieldMap(30, 30).build(),
      [squad],
      ANCHOR,
      { core, hp: RETREAT_HP + 1 },
    );
    const commands = choose(mission, sovereign.id);
    expect(commands.map((c) => c.type)).toEqual([ATTACK]);
    expect(struck(commands)).toBe("squad");
  });

  it("stays by the core once there: holds against a squad out of reach, strikes one beside her", () => {
    const core = { x: 11, y: 0, z: 11 };
    const far = sovereignMission(
      fieldMap(30, 30).build(),
      [squadAt("squad", 19, 11)],
      ANCHOR,
      { core, hp: RETREAT_HP },
    );
    expect(far.mission.vision.bugs.spotted).toContain("squad");
    const holding = choose(far.mission, far.sovereign.id);
    expect(holding.some((c) => c.type === MOVE)).toBe(false);
    const near = sovereignMission(
      fieldMap(30, 30).build(),
      [squadAt("squad", 14, 11)],
      ANCHOR,
      { core, hp: RETREAT_HP },
    );
    const striking = choose(near.mission, near.sovereign.id);
    expect(striking.map((c) => c.type)).toEqual([ATTACK]);
  });

  it("with nobody in view walks back inside her ground, and holds there", () => {
    const core = { x: 2, y: 0, z: 11 };
    const away = sovereignMission(fieldMap(30, 30).build(), [], ANCHOR, {
      core,
      hp: RETREAT_HP,
    });
    const back = choose(away.mission, away.sovereign.id);
    expect(back.map((c) => c.type)).toEqual([MOVE]);
    expect(
      footprintDistance(endOf(back, away.sovereign), 4, core),
    ).toBeLessThan(footprintDistance(away.sovereign.pos, 4, core));
    const home = sovereignMission(fieldMap(30, 30).build(), [], ANCHOR);
    expect(choose(home.mission, home.sovereign.id)).toEqual([]);
  });
});

describe("SovereignBehaviour: fair play (#1179, ADR 0006)", () => {
  it("does not react to a squad her side has not seen, however close it stands", () => {
    const squad = squadAt("squad", 15, 11);
    const { mission, sovereign } = sovereignMission(
      fieldMap(30, 30).build(),
      [squad],
      ANCHOR,
    );
    // Hide the squad from the swarm: nobody on her side has spotted it,
    // and nobody remembers it.
    const hidden: TacticalState = { ...mission, vision: emptyVision() };
    expect(bugView(hidden).units.map((u) => u.id)).toEqual([sovereign.id]);
    expect(choose(hidden, sovereign.id)).toEqual([]);
    // The same squad handed to her raw — the sabotage the view prevents
    // — would draw her in, so the fixture is not holding her still.
    const raw = behaviour.choose(
      { ...hidden, vision: mission.vision } as MissionView,
      sovereign.id,
      { rng: new Mulberry32Rng(7), combat: COMBAT_TUNING },
    );
    expect(raw.map((c) => c.type)).toEqual([MOVE, ATTACK]);
  });

  it("with no core to guard (a debug spawn) is on no leash: she chases what the swarm sees", () => {
    // Her leash from a core far west ends where she stands; the squad
    // east is spotted by a swarmer beside it.
    const units = [squadAt("squad", 27, 11), spotterAt("spotter", 26, 12)];
    const core = { x: 2, y: 0, z: 11 };
    const leashed = sovereignMission(fieldMap(30, 30).build(), units, ANCHOR, {
      core,
    });
    expect(footprintDistance(ANCHOR, 4, core)).toBe(
      SOVEREIGN_TUNING.leashRadius,
    );
    expect(
      endOf(choose(leashed.mission, leashed.sovereign.id), leashed.sovereign).x,
    ).toBeLessThanOrEqual(ANCHOR.x);
    const free = sovereignMission(fieldMap(30, 30).build(), units, ANCHOR, {
      core: null,
    });
    expect(free.sovereign.core).toBeUndefined();
    expect(
      endOf(choose(free.mission, free.sovereign.id), free.sovereign).x,
    ).toBeGreaterThan(ANCHOR.x);
  });
});

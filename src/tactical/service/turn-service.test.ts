import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import { endTurn } from "../model/end-turn-command";
import { MISSION_ENDED } from "../model/mission-ended-event";
import { move } from "../model/move-command";
import type { TacticalState } from "../model/tactical-state";
import { TURN_STARTED } from "../model/turn-started-event";
import { UNIT_DIED } from "../model/unit-died-event";
import { UNIT_MOVED } from "../model/unit-moved-event";
import { UNIT_STATUS_CHANGED } from "../model/unit-status-changed-event";
import { createMoveHandler } from "./move-handler";
import {
  blockUnitAt,
  ctxWith,
  FIXTURE_TEMPLATES,
  missionWith,
  openField,
  riggedRng,
  unitAt,
  walledField,
  withCivilian,
  fixtureAttackDeps,
} from "./tactical-fixtures.test-helper";
import { computeVision, unitCanSee } from "./vision-service";
import type { PhaseStep } from "./turn-service";
import {
  createEndTurnHandler,
  createOverwatchReaction,
  DEFAULT_PHASE_STEPS,
  overwatchReaction,
  refreshSides,
} from "./turn-service";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });
const ctx = ctxWith(riggedRng(true));
const handler = createEndTurnHandler();

/** The unit with the id, or a thrown fixture error. */
function unitIn(mission: TacticalState, id: string) {
  const unit = mission.units.find((u) => u.id === id);
  if (!unit) throw new Error(`fixture lost unit ${id}`);
  return unit;
}

// ===========================================
// End turn
// ===========================================

const DEPS = fixtureAttackDeps();

describe("createEndTurnHandler", () => {
  it("hands the turn to the bugs on the same turn: bugs refreshed, TDF suppression lifted, the dead untouched", () => {
    const mission = missionWith(openField().build(), [
      unitAt("u", "infantry", at(0, 0), {
        ap: 0,
        status: ["overwatch", "suppressed"],
      }),
      unitAt("b", "infantry", at(7, 7), {
        team: "bugs",
        ap: 0,
        status: ["overwatch", "hidden"],
      }),
      unitAt("corpse", "infantry", at(6, 7), { team: "bugs", ap: 0, hp: 0 }),
    ]);
    const outcome = handler(mission, endTurn(), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const next = outcome.value.state;
    expect(next.phase).toBe("bugs");
    expect(next.turn).toBe(1);
    expect(next.outcome).toBeUndefined();
    expect(outcome.value.events).toEqual([
      { type: TURN_STARTED, payload: { turn: 1, phase: "bugs" } },
    ]);
    expect(unitIn(next, "u").ap).toBe(0);
    expect(unitIn(next, "u").status).toEqual(["overwatch"]);
    expect(unitIn(next, "b").ap).toBe(2);
    expect(unitIn(next, "b").status).toEqual(["hidden"]);
    expect(unitIn(next, "corpse")).toBe(mission.units[2]);
    expect(unitIn(mission, "b").ap).toBe(0);
  });

  it("hands the turn back to the player on the next turn with the TDF refreshed", () => {
    const mission = missionWith(
      openField().build(),
      [
        unitAt("u", "mech", at(0, 0), { ap: 0, status: ["overwatch"] }),
        unitAt("b", "infantry", at(7, 7), {
          team: "bugs",
          ap: 0,
          status: ["suppressed"],
        }),
      ],
      { phase: "bugs", turn: 3 },
    );
    const outcome = handler(mission, endTurn(true), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const next = outcome.value.state;
    expect(next.phase).toBe("player");
    expect(next.turn).toBe(4);
    expect(outcome.value.events).toEqual([
      { type: TURN_STARTED, payload: { turn: 4, phase: "player" } },
    ]);
    expect(unitIn(next, "u").ap).toBe(2);
    expect(unitIn(next, "u").status).toEqual([]);
    expect(unitIn(next, "b").ap).toBe(0);
    expect(unitIn(next, "b").status).toEqual([]);
  });

  it("runs extra phase steps in order after the refresh and keeps their events", () => {
    const seen: string[] = [];
    const step: PhaseStep = (mission) => {
      seen.push(`${mission.phase}:${mission.units[0]?.ap ?? "?"}`);
      return {
        state: mission,
        events: [
          { type: TURN_STARTED, payload: { turn: 99, phase: mission.phase } },
        ],
      };
    };
    const mission = missionWith(openField().build(), [
      unitAt("b", "infantry", at(7, 7), { team: "bugs", ap: 0 }),
      unitAt("u", "infantry", at(0, 0)),
    ]);
    const outcome = createEndTurnHandler([refreshSides, step])(
      mission,
      endTurn(),
      ctx,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(seen).toEqual(["bugs:2"]);
    expect(outcome.value.events.map((e) => e.type)).toEqual([
      TURN_STARTED,
      TURN_STARTED,
    ]);
  });

  it("with a bug phase runner, plays the bugs and hands the turn back to the player in one command", () => {
    const seen: string[] = [];
    const moved = {
      unitId: "b",
      from: at(7, 7),
      to: at(6, 6),
      path: [at(6, 6)],
    };
    const runner: PhaseStep = (mission) => {
      seen.push(`${mission.phase}:${String(mission.turn)}`);
      return {
        state: {
          ...mission,
          units: mission.units.map((u) =>
            u.id === "b" ? { ...u, ap: 0, pos: at(6, 6) } : u,
          ),
        },
        events: [{ type: UNIT_MOVED, payload: moved }],
      };
    };
    const mission = missionWith(openField().build(), [
      unitAt("u", "infantry", at(0, 0), { ap: 0 }),
      unitAt("b", "infantry", at(7, 7), { team: "bugs", ap: 0 }),
    ]);
    const outcome = createEndTurnHandler(DEFAULT_PHASE_STEPS, runner)(
      mission,
      endTurn(),
      ctx,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(seen).toEqual(["bugs:1"]);
    expect(outcome.value.events).toEqual([
      { type: TURN_STARTED, payload: { turn: 1, phase: "bugs" } },
      { type: UNIT_MOVED, payload: moved },
      { type: TURN_STARTED, payload: { turn: 2, phase: "player" } },
    ]);
    const next = outcome.value.state;
    expect(next.phase).toBe("player");
    expect(next.turn).toBe(2);
    expect(next.outcome).toBeUndefined();
    expect(unitIn(next, "u").ap).toBe(2);
    expect(unitIn(next, "b").ap).toBe(0);
    expect(unitIn(next, "b").pos).toEqual(at(6, 6));
  });

  it("with a bug phase runner, ends the mission when the bugs decide it instead of opening the player's turn", () => {
    const wipe: PhaseStep = (mission) => ({
      state: {
        ...mission,
        units: mission.units.map((u) => (u.id === "u" ? { ...u, hp: 0 } : u)),
      },
      events: [],
    });
    const mission = missionWith(openField().build(), [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("b", "infantry", at(7, 7), { team: "bugs" }),
    ]);
    const outcome = createEndTurnHandler(DEFAULT_PHASE_STEPS, wipe)(
      mission,
      endTurn(),
      ctx,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.state.outcome).toBe("lost");
    expect(outcome.value.state.phase).toBe("bugs");
    expect(outcome.value.state.turn).toBe(1);
    expect(outcome.value.events).toEqual([
      { type: TURN_STARTED, payload: { turn: 1, phase: "bugs" } },
      { type: MISSION_ENDED, payload: { outcome: "lost", turn: 1 } },
    ]);
  });

  it("ends the mission when a phase step of the opening phase decides it (#1121)", () => {
    // A step that kills the last TDF unit as the player phase opens, as
    // a fire under it would. Before #1121 no step could kill, and the
    // mission would have opened a phase nobody could play.
    const lethal: PhaseStep = (mission) => ({
      state: {
        ...mission,
        units: mission.units.map((u) =>
          u.team === "tdf" ? { ...u, hp: 0 } : u,
        ),
      },
      events: [],
    });
    const mission = missionWith(
      openField().build(),
      [
        unitAt("s", "infantry", at(0, 0)),
        unitAt("b", "infantry", at(5, 5), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    const result = createEndTurnHandler([...DEFAULT_PHASE_STEPS, lethal])(
      mission,
      endTurn(),
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.outcome).toBe("lost");
    expect(result.value.events.map((e) => e.type)).toEqual([
      TURN_STARTED,
      MISSION_ENDED,
    ]);
  });

  it("ends the mission instead of starting a phase when a terminal condition holds", () => {
    // Everyone out with the objectives done: won at the boundary.
    const won = missionWith(
      openField().build(),
      [unitAt("b", "infantry", at(7, 7), { team: "bugs" })],
      {
        turn: 5,
        objectives: [
          { id: "o1", kind: "destroy-spawner", targetId: "s1", complete: true },
        ],
        extracted: [unitAt("u", "infantry", at(0, 0), { ap: 0 })],
      },
    );
    const outcome = handler(won, endTurn(), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.state.outcome).toBe("won");
    expect(outcome.value.state.phase).toBe("player");
    expect(outcome.value.state.turn).toBe(5);
    expect(outcome.value.events).toEqual([
      { type: MISSION_ENDED, payload: { outcome: "won", turn: 5 } },
    ]);
    const wiped = missionWith(openField().build(), [
      unitAt("u", "infantry", at(0, 0), { hp: 0 }),
      unitAt("b", "infantry", at(7, 7), { team: "bugs" }),
    ]);
    const lost = handler(wiped, endTurn(), ctx);
    expect(lost.ok && lost.value.state.outcome).toBe("lost");
  });
});

// ===========================================
// Overwatch reactions
// ===========================================

describe("overwatchReaction", () => {
  const T = COMBAT_TUNING;

  it("fires once at the first enemy step in sight, consumes the watch, and never fires twice", () => {
    const mission = missionWith(
      openField().build(),
      [
        unitAt("w", "infantry", at(0, 0), { ap: 0, status: ["overwatch"] }),
        unitAt("b", "infantry", at(3, 0), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    const first = overwatchReaction(
      mission,
      "b",
      ctxWith(riggedRng(true, "low")),
      T,
      DEPS,
    );
    expect(first.events).toEqual([
      {
        type: ATTACK_RESOLVED,
        payload: {
          attackerId: "w",
          targetId: "b",
          hit: true,
          damage: 2,
          targetHp: 8,
          // An overwatch shot names its weapon's reach like any other, so
          // the effect it plays is the watcher's weapon (#457).
          weaponRange: 5,
        },
      },
      { type: UNIT_STATUS_CHANGED, payload: { unitId: "w", status: [] } },
    ]);
    expect(unitIn(first.state, "w").status).toEqual([]);
    expect(unitIn(first.state, "w").ap).toBe(0);
    expect(unitIn(first.state, "b").hp).toBe(8);
    expect(unitIn(mission, "b").hp).toBe(10);
    const second = overwatchReaction(
      first.state,
      "b",
      ctxWith(riggedRng(true)),
      T,
      DEPS,
    );
    expect(second.events).toEqual([]);
    expect(second.state).toBe(first.state);
  });

  it("answers sight the same way the vision state does, on every case (#579)", () => {
    // The drift guard. Overwatch and `computeVision` used to spell out
    // range-and-line-of-sight separately; they agreed only because they
    // were the same two lines, and would have parted in silence the
    // moment sight grew a term. This pins both to `unitCanSee` itself.
    //
    // Both halves of the rule need a case that turns on them alone, or
    // the guard is decorative: with only wall cases, dropping the range
    // check from one caller still passed, because the fixture's sight
    // range of 8 covers every tile of the near half of an 8x8 field.
    const watching = { ap: 0, status: ["overwatch"] as const };
    const cases: readonly {
      name: string;
      map: TacticalState["map"];
      watcher: TileCoord;
      mover: TileCoord;
      expected: boolean;
    }[] = [
      {
        name: "line of sight blocked by the wall",
        map: walledField(),
        watcher: at(1, 4),
        mover: at(5, 4),
        expected: false,
      },
      {
        name: "in range with a clear line",
        map: openField().build(),
        watcher: at(1, 2),
        mover: at(3, 2),
        expected: true,
      },
      {
        name: "clear line but out of sight range",
        map: openField().build(),
        watcher: at(0, 0),
        mover: at(7, 7),
        expected: false,
      },
    ];
    for (const probe of cases) {
      const index = new TileIndex(probe.map);
      const mission = missionWith(
        probe.map,
        [
          unitAt("w", "infantry", probe.watcher, watching),
          unitAt("b", "infantry", probe.mover, { team: "bugs" }),
        ],
        { phase: "bugs" },
      );
      const predicate = unitCanSee(
        mission,
        unitIn(mission, "w"),
        probe.mover,
        index,
      );
      // The fixture says which case this is, so a rule change that makes
      // one of them moot fails here rather than quietly testing nothing.
      expect(predicate, `${probe.name}: predicate`).toBe(probe.expected);
      expect(
        computeVision(mission, "tdf", index).spotted.includes("b"),
        `${probe.name}: vision`,
      ).toBe(probe.expected);
      expect(
        overwatchReaction(
          mission,
          "b",
          ctxWith(riggedRng(true, "low")),
          T,
          DEPS,
        ).events.length > 0,
        `${probe.name}: overwatch`,
      ).toBe(probe.expected);
    }
  });

  it("lets the vision sweep follow the sight range rather than a fixed one (#579)", () => {
    // The one thing the case table above cannot catch. `computeVision`
    // walks a diamond and asks `unitCanSee` about each tile in it, so
    // the bounds are a second expression of "how far can this unit see"
    // — and a bound that stopped tracking `sightRangeOf` would clip the
    // predicate rather than contradict it, which no agreement test sees.
    // Fourteen tiles apart, so the fixture's usual 8 would not reach.
    const map = openField().build();
    const index = new TileIndex(map);
    const base = missionWith(
      map,
      [
        unitAt("w", "infantry", at(0, 0), { ap: 0, status: ["overwatch"] }),
        unitAt("b", "infantry", at(7, 7), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    const watcher = unitIn(base, "w");
    const template = base.templates[watcher.templateId];
    if (!template) throw new Error("fixture needs a template");
    const farSighted: TacticalState = {
      ...base,
      templates: {
        ...base.templates,
        [watcher.templateId]: { ...template, sightRange: 14 },
      },
    };
    expect(computeVision(base, "tdf", index).spotted).toEqual([]);
    expect(computeVision(farSighted, "tdf", index).spotted).toEqual(["b"]);
  });

  it("holds its fire without line of sight, at a hidden mover, at a friend, or when down or not watching", () => {
    const watching = { ap: 0, status: ["overwatch"] as const };
    const walled = missionWith(
      walledField(),
      [
        unitAt("w", "infantry", at(1, 4), watching),
        unitAt("b", "infantry", at(5, 4), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    expect(overwatchReaction(walled, "b", ctx, T, DEPS).events).toEqual([]);
    const field = openField().build();
    const hidden = missionWith(
      field,
      [
        unitAt("w", "infantry", at(0, 0), watching),
        unitAt("b", "infantry", at(3, 0), { team: "bugs", status: ["hidden"] }),
      ],
      { phase: "bugs" },
    );
    expect(overwatchReaction(hidden, "b", ctx, T, DEPS).events).toEqual([]);
    const friend = missionWith(field, [
      unitAt("w", "infantry", at(0, 0), watching),
      unitAt("u", "infantry", at(3, 0)),
    ]);
    expect(overwatchReaction(friend, "u", ctx, T, DEPS).events).toEqual([]);
    const down = missionWith(
      field,
      [
        unitAt("w", "infantry", at(0, 0), { ...watching, hp: 0 }),
        unitAt("b", "infantry", at(3, 0), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    expect(overwatchReaction(down, "b", ctx, T, DEPS).events).toEqual([]);
    const idle = missionWith(
      field,
      [
        unitAt("w", "infantry", at(0, 0), { ap: 0 }),
        unitAt("b", "infantry", at(3, 0), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    expect(overwatchReaction(idle, "b", ctx, T, DEPS).events).toEqual([]);
    expect(overwatchReaction(idle, "ghost", ctx, T, DEPS).events).toEqual([]);
  });

  it("lets every watcher in sight fire in turn and stops once the mover is down", () => {
    const mission = missionWith(
      openField().build(),
      [
        unitAt("w1", "infantry", at(0, 0), { ap: 0, status: ["overwatch"] }),
        unitAt("w2", "infantry", at(0, 2), { ap: 0, status: ["overwatch"] }),
        unitAt("b", "infantry", at(3, 1), { team: "bugs", hp: 3 }),
      ],
      { phase: "bugs" },
    );
    const result = overwatchReaction(
      mission,
      "b",
      ctxWith(riggedRng(true, "high")),
      T,
      DEPS,
    );
    expect(result.events.map((e) => e.type)).toEqual([
      ATTACK_RESOLVED,
      UNIT_DIED,
      UNIT_STATUS_CHANGED,
    ]);
    expect(unitIn(result.state, "b").hp).toBe(0);
    expect(unitIn(result.state, "w1").status).toEqual([]);
    expect(unitIn(result.state, "w2").status).toEqual(["overwatch"]);
    const survives = missionWith(
      openField().build(),
      [
        unitAt("w1", "infantry", at(0, 0), { ap: 0, status: ["overwatch"] }),
        unitAt("w2", "infantry", at(0, 2), { ap: 0, status: ["overwatch"] }),
        unitAt("b", "infantry", at(3, 1), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    const both = overwatchReaction(
      survives,
      "b",
      ctxWith(riggedRng(true, "high")),
      T,
      DEPS,
    );
    expect(both.events.map((e) => e.type)).toEqual([
      ATTACK_RESOLVED,
      UNIT_STATUS_CHANGED,
      ATTACK_RESOLVED,
      UNIT_STATUS_CHANGED,
    ]);
    expect(unitIn(both.state, "b").hp).toBe(2);
  });
  it("holds its shot at a mover it cannot see (ADR 0006 §3)", () => {
    // A watcher whose eyes are shorter than its gun: the mover is inside
    // weapon range but outside sight, so the reaction is refused. No
    // shipped template is built this way — the guard is what keeps it
    // that way, and unit-tuning.test.ts pins the numbers.
    const map = openField().build();
    const mission = missionWith(map, [
      unitAt("w", "infantry", at(0, 0), {
        team: "bugs",
        status: ["overwatch"],
      }),
      unitAt("m", "infantry", at(4, 0)),
    ]);
    const blind: TacticalState = {
      ...mission,
      templates: {
        ...mission.templates,
        [FIXTURE_TEMPLATES.bug]: {
          ...mission.templates[FIXTURE_TEMPLATES.bug]!,
          sightRange: 2,
        },
      },
    };
    const applied = overwatchReaction(
      blind,
      "m",
      ctxWith(riggedRng(true)),
      COMBAT_TUNING,
      DEPS,
    );
    expect(applied.events).toEqual([]);

    // The same watcher with eyes as long as its gun does fire.
    const seeing: TacticalState = {
      ...mission,
      templates: {
        ...mission.templates,
        [FIXTURE_TEMPLATES.bug]: {
          ...mission.templates[FIXTURE_TEMPLATES.bug]!,
          sightRange: 8,
        },
      },
    };
    expect(
      overwatchReaction(
        seeing,
        "m",
        ctxWith(riggedRng(true)),
        COMBAT_TUNING,
        DEPS,
      ).events.length,
    ).toBeGreaterThan(0);
  });
});

// ===========================================
// Hooked into Move
// ===========================================

describe("createMoveHandler with the overwatch reaction", () => {
  const moveHandler = createMoveHandler(
    createOverwatchReaction(COMBAT_TUNING, fixtureAttackDeps()),
  );

  it("fires after the step that brings the mover into range and ends the walk when it dies there", () => {
    const mission = missionWith(
      openField().build(),
      [
        unitAt("w", "infantry", at(0, 0), { ap: 0, status: ["overwatch"] }),
        unitAt("b", "infantry", at(7, 0), { team: "bugs", hp: 4 }),
      ],
      { phase: "bugs" },
    );
    const path = [at(6, 0), at(5, 0), at(4, 0), at(3, 0)];
    const outcome = moveHandler(
      mission,
      move("b", path),
      ctxWith(riggedRng(true, "high")),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.type)).toEqual([
      UNIT_MOVED,
      UNIT_MOVED,
      ATTACK_RESOLVED,
      UNIT_DIED,
      UNIT_STATUS_CHANGED,
    ]);
    const bug = unitIn(outcome.value.state, "b");
    expect(bug.pos).toEqual(at(5, 0));
    expect(bug.hp).toBe(0);
    expect(unitIn(outcome.value.state, "w").status).toEqual([]);
  });

  it("lets a missed mover finish its path and still pay for every step", () => {
    const mission = missionWith(
      openField().build(),
      [
        unitAt("w", "infantry", at(0, 0), { ap: 0, status: ["overwatch"] }),
        unitAt("b", "infantry", at(7, 0), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    const path = [at(6, 0), at(5, 0), at(4, 0), at(3, 0)];
    const outcome = moveHandler(
      mission,
      move("b", path),
      ctxWith(riggedRng(false)),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.type)).toEqual([
      UNIT_MOVED,
      UNIT_MOVED,
      ATTACK_RESOLVED,
      UNIT_STATUS_CHANGED,
      UNIT_MOVED,
      UNIT_MOVED,
    ]);
    const bug = unitIn(outcome.value.state, "b");
    expect(bug.pos).toEqual(at(3, 0));
    expect(bug.hp).toBe(10);
    expect(bug.ap).toBe(0);
  });
});

// ===========================================
// Footprints (#1130)
// ===========================================

describe("overwatchReaction against a unit on a 2×2 block (#1130)", () => {
  it("fires when any tile of the block is in sight, at the tile nearest the watcher", () => {
    // A solid wall between x = 3 and x = 4 with a window at z = 2. The
    // watcher at (1,2) sees along that row; a block anchored at (4,1)
    // shows only its tile (4,2) there.
    const builder = openField();
    for (let z = 0; z < 8; z++) {
      builder.wall({ x: 3, y: 0, z }, "e", z === 2 ? "window" : "solid");
    }
    const map = builder.build();
    const mission = missionWith(
      map,
      [
        unitAt("w", "infantry", at(1, 2), { ap: 0, status: ["overwatch"] }),
        blockUnitAt("b", at(4, 1)),
      ],
      { phase: "bugs" },
    );
    const shot = overwatchReaction(
      mission,
      "b",
      ctxWith(riggedRng(true, "low")),
      COMBAT_TUNING,
      DEPS,
    );
    expect(shot.events.map((e) => e.type)).toEqual([
      ATTACK_RESOLVED,
      UNIT_STATUS_CHANGED,
    ]);
    expect(unitIn(shot.state, "b").hp).toBe(8);
    // A single tile at the same anchor is behind the masonry: no shot.
    const single = missionWith(
      map,
      [
        unitAt("w", "infantry", at(1, 2), { ap: 0, status: ["overwatch"] }),
        unitAt("b", "infantry", at(4, 1), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    expect(
      overwatchReaction(
        single,
        "b",
        ctxWith(riggedRng(true)),
        COMBAT_TUNING,
        DEPS,
      ).events,
    ).toEqual([]);
  });
});

// ===========================================
// Two-shot watches (#1138)
// ===========================================

describe("overwatchReaction with a two-shot watch (#1138)", () => {
  const T = COMBAT_TUNING;
  /** A watcher whose gun grants two reaction shots, as a turret's does. */
  const twoShot = () => ({
    ...unitAt("w", "infantry", at(0, 0), { ap: 0, status: ["overwatch"] }),
    overwatchShots: 2,
  });

  it("keeps watching after the first shot and fires again at the mover's next step, clearing only then", () => {
    const mission = missionWith(
      openField().build(),
      [twoShot(), unitAt("b", "infantry", at(3, 0), { team: "bugs" })],
      { phase: "bugs" },
    );
    const first = overwatchReaction(
      mission,
      "b",
      ctxWith(riggedRng(true, "low")),
      T,
      DEPS,
    );
    // One shot per step, and no status line: the watcher is still watching.
    expect(first.events.map((e) => e.type)).toEqual([ATTACK_RESOLVED]);
    expect(unitIn(first.state, "w")).toMatchObject({
      status: ["overwatch"],
      overwatchShots: 1,
    });
    expect(unitIn(first.state, "b").hp).toBe(8);
    const second = overwatchReaction(
      first.state,
      "b",
      ctxWith(riggedRng(true, "low")),
      T,
      DEPS,
    );
    expect(second.events.map((e) => e.type)).toEqual([
      ATTACK_RESOLVED,
      UNIT_STATUS_CHANGED,
    ]);
    expect(unitIn(second.state, "w").status).toEqual([]);
    expect("overwatchShots" in unitIn(second.state, "w")).toBe(false);
    expect(unitIn(second.state, "b").hp).toBe(6);
    const third = overwatchReaction(
      second.state,
      "b",
      ctxWith(riggedRng(true)),
      T,
      DEPS,
    );
    expect(third.events).toEqual([]);
    expect(third.state).toBe(second.state);
  });

  it("spends the second shot on the next bug to move when the first stops stepping", () => {
    const mission = missionWith(
      openField().build(),
      [
        twoShot(),
        unitAt("b1", "infantry", at(3, 0), { team: "bugs" }),
        unitAt("b2", "infantry", at(0, 3), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    const first = overwatchReaction(mission, "b1", ctx, T, DEPS);
    const second = overwatchReaction(first.state, "b2", ctx, T, DEPS);
    expect(unitIn(second.state, "b1").hp).toBe(8);
    expect(unitIn(second.state, "b2").hp).toBe(8);
    expect(unitIn(second.state, "w").status).toEqual([]);
  });

  it("through the move handler, hits a walking bug on two consecutive steps", () => {
    const moveHandler = createMoveHandler(createOverwatchReaction(T, DEPS));
    const mission = missionWith(
      openField().build(),
      [twoShot(), unitAt("b", "infantry", at(7, 0), { team: "bugs" })],
      { phase: "bugs" },
    );
    const outcome = moveHandler(
      mission,
      move("b", [at(6, 0), at(5, 0), at(4, 0), at(3, 0)]),
      ctxWith(riggedRng(true, "low")),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.type)).toEqual([
      UNIT_MOVED,
      UNIT_MOVED,
      ATTACK_RESOLVED,
      UNIT_MOVED,
      ATTACK_RESOLVED,
      UNIT_STATUS_CHANGED,
      UNIT_MOVED,
    ]);
    expect(unitIn(outcome.value.state, "b")).toMatchObject({
      pos: at(3, 0),
      hp: 6,
    });
  });
});

// ===========================================
// Dormant broods (#1179)
// ===========================================

describe("dormant bugs and the turn engine (#1179)", () => {
  const T = COMBAT_TUNING;
  const watching = { ap: 0, status: ["overwatch"] as const };

  it("a dormant bug neither draws a watch's fire nor keeps a watch of its own", () => {
    const field = openField().build();
    const awake = missionWith(
      field,
      [
        unitAt("w", "infantry", at(0, 0), watching),
        unitAt("b", "infantry", at(3, 0), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    // The control: the same bug awake draws the shot.
    expect(
      overwatchReaction(awake, "b", ctx, T, DEPS).events.some(
        (event) => event.type === ATTACK_RESOLVED,
      ),
    ).toBe(true);
    const asleep = missionWith(
      field,
      [
        unitAt("w", "infantry", at(0, 0), watching),
        unitAt("b", "infantry", at(3, 0), {
          team: "bugs",
          status: ["dormant"],
        }),
      ],
      { phase: "bugs" },
    );
    expect(overwatchReaction(asleep, "b", ctx, T, DEPS).events).toEqual([]);
    const sleepingWatch = missionWith(field, [
      unitAt("w", "infantry", at(0, 0), {
        team: "bugs",
        ap: 0,
        status: ["overwatch", "dormant"],
      }),
      unitAt("u", "infantry", at(3, 0)),
    ]);
    expect(overwatchReaction(sleepingWatch, "u", ctx, T, DEPS).events).toEqual(
      [],
    );
  });

  /** A bugs phase driven from outside (Jev), with `b` unfinished and asleep or not. */
  function externalPhase(dormant: boolean): TacticalState {
    return {
      ...missionWith(
        openField().build(),
        [
          unitAt("u", "infantry", at(0, 0)),
          unitAt("b", "infantry", at(5, 5), {
            team: "bugs",
            status: dormant ? ["dormant"] : [],
          }),
        ],
        { phase: "bugs" },
      ),
      jev: {
        entities: { b: { enabled: true, entityPrompt: "" } },
        commanders: { tdf: "", bugs: "" },
        activation: {
          turn: 1,
          phase: "bugs",
          finished: [],
          externalBugs: true,
        },
      },
    };
  }

  it("never holds an externally driven bug phase open for a sleeper", () => {
    expect(handler(externalPhase(false), endTurn(), ctx).ok).toBe(false);
    const ended = handler(externalPhase(true), endTurn(), ctx);
    expect(ended.ok).toBe(true);
    if (ended.ok) expect(ended.value.state.phase).toBe("player");
  });

  it("does not hand a bug phase to Jev for a Jev-enabled bug that is asleep", () => {
    const opening = (dormant: boolean) => {
      const mission = externalPhase(dormant);
      const player = {
        ...mission,
        phase: "player" as const,
        jev: { ...mission.jev!, activation: undefined },
      };
      const opened = handler(player, endTurn(), ctx);
      if (!opened.ok) throw new Error("EndTurn was refused");
      return opened.value.state.jev?.activation?.externalBugs;
    };
    expect(opening(false)).toBe(true);
    expect(opening(true)).toBe(false);
  });
});

describe("refreshSides with civilian groups (campaign arc §6.4)", () => {
  it("gives a freed group its actions at the player's turn, and a trapped one none", () => {
    const base = missionWith(
      openField().build(),
      [unitAt("u", "infantry", at(0, 0), { ap: 0 })],
      // The step runs once the phase has turned to the side it refreshes.
      { phase: "player", turn: 3 },
    );
    const town = withCivilian(
      withCivilian(base, "trapped", at(3, 3)),
      "freed",
      at(5, 5),
      { trapped: false },
    );
    const spent = {
      ...town,
      units: town.units.map((unit) =>
        unit.id === "freed" ? { ...unit, ap: 0 } : unit,
      ),
    };
    const next = refreshSides(spent, ctx).state;
    expect(unitIn(next, "u").ap).toBe(2);
    expect(unitIn(next, "freed").ap).toBe(unitIn(next, "freed").maxAp);
    expect(unitIn(next, "trapped").ap).toBe(0);
    expect(unitIn(next, "trapped").trapped).toBe(true);
  });
});

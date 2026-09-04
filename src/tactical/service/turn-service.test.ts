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
  ctxWith,
  FIXTURE_TEMPLATES,
  missionWith,
  openField,
  riggedRng,
  unitAt,
  walledField,
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

  it("ends the mission instead of starting a phase when a terminal condition holds", () => {
    const won = missionWith(
      openField().build(),
      [unitAt("u", "infantry", at(0, 0), { ap: 0 })],
      {
        turn: 5,
        objectives: [
          { id: "o1", kind: "destroy-spawner", targetId: "s1", complete: true },
        ],
      },
    );
    const outcome = handler(won, endTurn(), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.state.outcome).toBe("won");
    expect(outcome.value.state.phase).toBe("player");
    expect(outcome.value.state.turn).toBe(5);
    expect(unitIn(outcome.value.state, "u").ap).toBe(0);
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
        overwatchReaction(mission, "b", ctxWith(riggedRng(true, "low")), T)
          .events.length > 0,
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
    expect(overwatchReaction(walled, "b", ctx, T).events).toEqual([]);
    const field = openField().build();
    const hidden = missionWith(
      field,
      [
        unitAt("w", "infantry", at(0, 0), watching),
        unitAt("b", "infantry", at(3, 0), { team: "bugs", status: ["hidden"] }),
      ],
      { phase: "bugs" },
    );
    expect(overwatchReaction(hidden, "b", ctx, T).events).toEqual([]);
    const friend = missionWith(field, [
      unitAt("w", "infantry", at(0, 0), watching),
      unitAt("u", "infantry", at(3, 0)),
    ]);
    expect(overwatchReaction(friend, "u", ctx, T).events).toEqual([]);
    const down = missionWith(
      field,
      [
        unitAt("w", "infantry", at(0, 0), { ...watching, hp: 0 }),
        unitAt("b", "infantry", at(3, 0), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    expect(overwatchReaction(down, "b", ctx, T).events).toEqual([]);
    const idle = missionWith(
      field,
      [
        unitAt("w", "infantry", at(0, 0), { ap: 0 }),
        unitAt("b", "infantry", at(3, 0), { team: "bugs" }),
      ],
      { phase: "bugs" },
    );
    expect(overwatchReaction(idle, "b", ctx, T).events).toEqual([]);
    expect(overwatchReaction(idle, "ghost", ctx, T).events).toEqual([]);
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
      overwatchReaction(seeing, "m", ctxWith(riggedRng(true)), COMBAT_TUNING)
        .events.length,
    ).toBeGreaterThan(0);
  });
});

// ===========================================
// Hooked into Move
// ===========================================

describe("createMoveHandler with the overwatch reaction", () => {
  const moveHandler = createMoveHandler(createOverwatchReaction(COMBAT_TUNING));

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

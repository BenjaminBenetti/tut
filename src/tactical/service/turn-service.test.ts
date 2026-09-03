import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
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
  missionWith,
  openField,
  riggedRng,
  unitAt,
  walledField,
} from "./tactical-fixtures.test-helper";
import type { PhaseStep } from "./turn-service";
import {
  createEndTurnHandler,
  createOverwatchReaction,
  missionOutcome,
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
// Terminal conditions
// ===========================================

describe("missionOutcome", () => {
  const open = [
    { id: "o1", kind: "destroy-spawner", targetId: "s1", complete: false },
  ] as const;
  const done = [
    { id: "o1", kind: "destroy-spawner", targetId: "s1", complete: true },
  ] as const;

  it("is undefined while an objective is open and a TDF unit stands, even with no objectives at all", () => {
    const map = openField().build();
    expect(
      missionOutcome(
        missionWith(map, [unitAt("u", "infantry", at(0, 0))], {
          objectives: open,
        }),
      ),
    ).toBeUndefined();
    expect(
      missionOutcome(missionWith(map, [unitAt("u", "infantry", at(0, 0))])),
    ).toBeUndefined();
  });

  it("is won when every objective is complete, whoever is left standing", () => {
    const map = openField().build();
    expect(
      missionOutcome(
        missionWith(map, [unitAt("u", "infantry", at(0, 0))], {
          objectives: done,
        }),
      ),
    ).toBe("won");
    expect(
      missionOutcome(
        missionWith(map, [unitAt("u", "infantry", at(0, 0), { hp: 0 })], {
          objectives: done,
        }),
      ),
    ).toBe("won");
  });

  it("is lost on a wipe with nobody extracted and extracted once the survivors have left", () => {
    const map = openField().build();
    const bugsOnly = [unitAt("b", "infantry", at(7, 7), { team: "bugs" })];
    expect(
      missionOutcome(missionWith(map, bugsOnly, { objectives: open })),
    ).toBe("lost");
    expect(
      missionOutcome(
        missionWith(map, bugsOnly, { objectives: open, extracted: ["u"] }),
      ),
    ).toBe("extracted");
    const partly = [unitAt("u", "infantry", at(0, 0)), ...bugsOnly];
    expect(
      missionOutcome(
        missionWith(map, partly, { objectives: open, extracted: ["v"] }),
      ),
    ).toBeUndefined();
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

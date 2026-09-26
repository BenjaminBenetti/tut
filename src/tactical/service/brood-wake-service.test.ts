import { describe, expect, it } from "vitest";

import { err } from "../../core/model/result";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { attack } from "../model/attack-command";
import { BLAST_RESOLVED } from "../model/blast-resolved-event";
import type { Brood } from "../model/brood";
import type { BroodWakeTuning } from "../model/brood-tuning";
import { BROOD_WOKE } from "../model/brood-woke-event";
import { EFFECT_STARTED } from "../model/effect-started-event";
import { move } from "../model/move-command";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { isDormant } from "../model/unit";
import { UNIT_STATUS_CHANGED } from "../model/unit-status-changed-event";
import type { UnitTemplate } from "../model/unit-template";
import {
  wakeBrood,
  wakeBroods,
  wakingStep,
  withBroodWaking,
  withBroodWakingAll,
  withinWakeZone,
} from "./brood-wake-service";
import { createAttackHandler } from "./combat-service";
import { restingBugIds } from "./dormancy-service";
import { createMoveHandler } from "./move-handler";
import {
  burrowerAt,
  ctxWith,
  fixtureAttackDeps,
  missionWith,
  riggedRng,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** Wake tuning for the fixtures: heard from six tiles beyond the edge. */
const WAKE: BroodWakeTuning = { noiseRadius: 6, heavyArmorPen: 1 };

const ATTACK_DEPS = fixtureAttackDeps();
const ATTACK_HANDLER = createAttackHandler(
  COMBAT_TUNING,
  ATTACK_DEPS,
) as TacticalHandler;
const MOVE_HANDLER = createMoveHandler() as TacticalHandler;

/** A heavy gun: the heavy machine gun's penetration on a range-10 barrel. */
const HMG_TEMPLATE: UnitTemplate = {
  id: "squad:hmg",
  name: "HMG",
  maxHp: 10,
  maxAp: 2,
  move: 3,
  weapons: [
    {
      id: "primary",
      name: "Heavy Machine Gun",
      profile: { range: 10, accuracy: 60, damage: 3, armorPen: 1 },
    },
  ],
  sightRange: 12,
  armor: 0,
  passClass: "infantry",
  modelId: "tdf.infantry.rifle",
};

/** A sleeping bug of the fixture species. */
function sleeper(id: string, pos: TileCoord): Unit {
  return unitAt(id, "infantry", pos, { team: "bugs", status: ["dormant"] });
}

/**
 * Two broods on a 40×40 field, far apart: A around (10, 10) and B around
 * (30, 30), both radius 3, every member asleep. The squad's rifle `u`
 * stands at (10, 18), eight tiles south of A's centre: outside A's zone,
 * inside its earshot (3 + 6), nowhere near B.
 *
 * ```
 *   z=10   a1 a2        A (r 3)
 *   z=11   a3
 *   z=18   u                          B (r 3) at (30, 30): b1 b2
 * ```
 */
function twoBroods(extra: readonly Unit[] = []): TacticalState {
  const map = new FixtureMapBuilder(40, 40, 3).fillGround().build();
  const broods: readonly Brood[] = [
    {
      id: "brood-a",
      wake: { centre: at(10, 10), radius: 3 },
      memberIds: ["a1", "a2", "a3"],
      label: "north-west chamber",
    },
    {
      id: "brood-b",
      wake: { centre: at(30, 30), radius: 3 },
      memberIds: ["b1", "b2"],
      label: "south-east chamber",
    },
  ];
  const base = missionWith(map, [
    unitAt("u", "infantry", at(10, 18)),
    sleeper("a1", at(10, 10)),
    sleeper("a2", at(11, 10)),
    sleeper("a3", at(10, 11)),
    sleeper("b1", at(30, 30)),
    sleeper("b2", at(31, 30)),
    ...extra,
  ]);
  return {
    ...base,
    broods,
    templates: { ...base.templates, [HMG_TEMPLATE.id]: HMG_TEMPLATE },
  };
}

/** The mission's brood by id. */
function brood(mission: TacticalState, id: string): Brood {
  const found = mission.broods?.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no brood ${id}`);
  return found;
}

/** Whether every member of the brood is awake (no `dormant` status). */
function allAwake(mission: TacticalState, id: string): boolean {
  return brood(mission, id).memberIds.every(
    (memberId) => !isDormant(unitOf(mission, memberId)),
  );
}

/** Whether every member of the brood is still asleep. */
function allAsleep(mission: TacticalState, id: string): boolean {
  return brood(mission, id).memberIds.every((memberId) =>
    isDormant(unitOf(mission, memberId)),
  );
}

/** The unit by id. */
function unitOf(mission: TacticalState, id: string): Unit {
  const unit = mission.units.find((entry) => entry.id === id);
  if (unit === undefined) throw new Error(`no unit ${id}`);
  return unit;
}

/** Applies a command through the handler wrapped in waking, expecting it to land. */
function applyWaking(
  handler: TacticalHandler,
  mission: TacticalState,
  command: Parameters<TacticalHandler>[1],
  hit = true,
): TacticalApplied<TacticalState> {
  const outcome = withBroodWaking(handler, WAKE)(
    mission,
    command,
    ctxWith(riggedRng(hit)),
  );
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
  return outcome.value;
}

/** A change with no state edit, only the events. */
function eventsOnly(
  mission: TacticalState,
  events: readonly TacticalEvent[],
): TacticalApplied<TacticalState> {
  return { state: mission, events };
}

/** A blast by `attackerId` at the impact tile. */
function blast(
  attackerId: string,
  impact: TileCoord,
  radius: number,
  extra: { smoke?: boolean; hit?: boolean } = {},
): TacticalEvent {
  return {
    type: BLAST_RESOLVED,
    payload: {
      attackerId,
      impact,
      hit: extra.hit ?? true,
      radius,
      aimedAtTile: true,
      weaponRange: 8,
      ...(extra.smoke === undefined ? {} : { smoke: extra.smoke }),
      victims: [],
    },
  };
}

// ===========================================
// Tests
// ===========================================

describe("wakeBroods: enter", () => {
  it("wakes the whole brood when a squad unit ends a move step inside its zone, and no other brood", () => {
    const mission = twoBroods();
    const applied = applyWaking(
      MOVE_HANDLER,
      mission,
      move("u", [at(10, 17), at(10, 16), at(10, 15), at(10, 14), at(10, 13)]),
    );
    expect(allAwake(applied.state, "brood-a")).toBe(true);
    expect(brood(applied.state, "brood-a").woke).toEqual({
      turn: 1,
      phase: "player",
      cause: "enter",
    });
    expect(allAsleep(applied.state, "brood-b")).toBe(true);
    expect(brood(applied.state, "brood-b").woke).toBeUndefined();
    const woke = applied.events.filter((event) => event.type === BROOD_WOKE);
    expect(woke).toEqual([
      {
        type: BROOD_WOKE,
        payload: {
          broodId: "brood-a",
          cause: "enter",
          label: "north-west chamber",
          unitIds: ["a1", "a2", "a3"],
        },
      },
    ]);
  });

  it("sleeps through a walk that stops one tile short of the zone", () => {
    const mission = twoBroods();
    const applied = applyWaking(
      MOVE_HANDLER,
      mission,
      move("u", [at(10, 17), at(10, 16), at(10, 15), at(10, 14)]),
    );
    expect(allAsleep(applied.state, "brood-a")).toBe(true);
    expect(applied.events.some((event) => event.type === BROOD_WOKE)).toBe(
      false,
    );
  });

  it("is not moved by a burrower underfoot: walking over one wakes only what walking there always would (#1179)", () => {
    // Waking is about the squad's side and the zones. A burrower under
    // the path — awake, or a lone sleeper — holds no tile, is not hurt
    // by a boot on its column and is no zone, so the walk that stops
    // short still wakes nothing, and one that goes on wakes A by
    // entering, as it would over bare ground.
    const underfoot = [
      burrowerAt("awake-under", at(10, 16)),
      burrowerAt("asleep-under", at(10, 15), {
        status: ["burrowed", "dormant"],
      }),
    ];
    const short = applyWaking(
      MOVE_HANDLER,
      twoBroods(underfoot),
      move("u", [at(10, 17), at(10, 16), at(10, 15), at(10, 14)]),
    );
    expect(allAsleep(short.state, "brood-a")).toBe(true);
    expect(isDormant(unitOf(short.state, "asleep-under"))).toBe(true);
    expect(
      short.events.filter(
        (event) =>
          event.type === BROOD_WOKE || event.type === UNIT_STATUS_CHANGED,
      ),
    ).toEqual([]);
    const into = applyWaking(
      MOVE_HANDLER,
      twoBroods(underfoot),
      move("u", [at(10, 17), at(10, 16), at(10, 15), at(10, 14), at(10, 13)]),
    );
    expect(brood(into.state, "brood-a").woke?.cause).toBe("enter");
    expect(allAsleep(into.state, "brood-b")).toBe(true);
    expect(isDormant(unitOf(into.state, "asleep-under"))).toBe(true);
  });

  it("measures the zone as a Euclidean circle: (12, 12) is inside radius 3, (13, 12) is not", () => {
    const zone = { centre: at(10, 10), radius: 3 };
    expect(withinWakeZone(zone, at(12, 12))).toBe(true);
    expect(withinWakeZone(zone, at(13, 12))).toBe(false);
    expect(withinWakeZone(zone, { x: 10, y: 9, z: 13 })).toBe(true);
    expect(withinWakeZone(zone, at(16, 10), 3)).toBe(true);
  });
});

describe("wakeBroods: attack", () => {
  it("wakes a dormant bug that is hit, and its whole brood with it, and no other", () => {
    const mission = {
      ...twoBroods(),
      units: twoBroods().units.map((unit) =>
        unit.id === "u" ? { ...unit, pos: at(10, 15) } : unit,
      ),
    };
    const applied = applyWaking(ATTACK_HANDLER, mission, attack("u", "a1"));
    expect(unitOf(applied.state, "a1").hp).toBeLessThan(10);
    expect(allAwake(applied.state, "brood-a")).toBe(true);
    expect(brood(applied.state, "brood-a").woke?.cause).toBe("attack");
    expect(allAsleep(applied.state, "brood-b")).toBe(true);
  });

  it("wakes the brood on a shot that misses a sleeper: the shot still landed in the zone", () => {
    const mission = {
      ...twoBroods(),
      units: twoBroods().units.map((unit) =>
        unit.id === "u" ? { ...unit, pos: at(10, 15) } : unit,
      ),
    };
    const applied = applyWaking(
      ATTACK_HANDLER,
      mission,
      attack("u", "a1"),
      false,
    );
    expect(unitOf(applied.state, "a1").hp).toBe(10);
    expect(brood(applied.state, "brood-a").woke?.cause).toBe("attack");
    expect(allAsleep(applied.state, "brood-b")).toBe(true);
  });

  it("wakes the brood on a blast whose reach overlaps the zone, but not on one that falls short", () => {
    const mission = twoBroods();
    const reaching = wakeBroods(
      mission,
      eventsOnly(mission, [blast("u", at(10, 15), 2)]),
      WAKE,
    );
    expect(brood(reaching.state, "brood-a").woke?.cause).toBe("attack");
    expect(allAsleep(reaching.state, "brood-b")).toBe(true);
    // Six from the centre with a reach of two: outside the zone, but an
    // explosion inside earshot, so it wakes the brood as noise instead.
    const short = wakeBroods(
      mission,
      eventsOnly(mission, [blast("u", at(10, 16), 2)]),
      WAKE,
    );
    expect(brood(short.state, "brood-a").woke?.cause).toBe("noise");
  });

  it("wakes the brood on a fire the squad lit inside the zone", () => {
    const mission = twoBroods();
    const applied = wakeBroods(
      mission,
      eventsOnly(mission, [
        {
          type: EFFECT_STARTED,
          payload: {
            effectId: "effect-1",
            kind: "fire",
            tile: at(11, 11),
            unitId: "u",
            rekindled: false,
          },
        },
      ]),
      WAKE,
    );
    expect(brood(applied.state, "brood-a").woke?.cause).toBe("attack");
    expect(allAsleep(applied.state, "brood-b")).toBe(true);
  });

  it("wakes a brood whose sleeper was hurt by anything, a bug's stray blow included", () => {
    const mission = twoBroods();
    const hurt = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === "b2" ? { ...unit, hp: 6 } : unit,
      ),
    };
    const applied = wakeBroods(mission, eventsOnly(hurt, []), WAKE);
    expect(brood(applied.state, "brood-b").woke?.cause).toBe("attack");
    expect(allAwake(applied.state, "brood-b")).toBe(true);
    expect(allAsleep(applied.state, "brood-a")).toBe(true);
  });

  it("still wakes, and records why, when the blow kills the brood's only sleeper", () => {
    const mission = twoBroods();
    const lone: TacticalState = {
      ...mission,
      broods: [
        {
          id: "brood-c",
          wake: { centre: at(20, 5), radius: 2 },
          memberIds: ["c1"],
        },
      ],
      units: [...mission.units, sleeper("c1", at(20, 5))],
    };
    const killed = {
      ...lone,
      units: lone.units.map((unit) =>
        unit.id === "c1" ? { ...unit, hp: 0 } : unit,
      ),
    };
    const applied = wakeBroods(lone, eventsOnly(killed, []), WAKE);
    expect(brood(applied.state, "brood-c").woke?.cause).toBe("attack");
    expect(isDormant(unitOf(applied.state, "c1"))).toBe(false);
  });

  it("ignores the bugs' own shots and blasts landing in the zone when they hurt nobody asleep", () => {
    const mission = twoBroods([
      unitAt("w", "infantry", at(14, 14), { team: "bugs" }),
    ]);
    const applied = wakeBroods(
      mission,
      eventsOnly(mission, [blast("w", at(10, 10), 2)]),
      WAKE,
    );
    expect(applied).toEqual(eventsOnly(mission, [blast("w", at(10, 10), 2)]));
    expect(allAsleep(applied.state, "brood-a")).toBe(true);
  });

  it("ignores smoke, and a blast that never went off", () => {
    const mission = twoBroods();
    const applied = wakeBroods(
      mission,
      eventsOnly(mission, [
        blast("u", at(10, 10), 1, { smoke: true }),
        blast("u", at(10, 10), 1, { hit: false }),
      ]),
      WAKE,
    );
    expect(allAsleep(applied.state, "brood-a")).toBe(true);
  });
});

describe("wakeBroods: noise", () => {
  /** The heavy gunner `h` at (10, 17), seven from A's centre, and an awake bug `w` at (10, 25) to shoot. */
  function gunnery(heavy: boolean): TacticalState {
    const mission = twoBroods([
      {
        ...unitAt("h", "infantry", at(10, 17)),
        templateId: heavy ? HMG_TEMPLATE.id : "squad:fixture",
      },
      unitAt("w", "infantry", at(10, 22), { team: "bugs" }),
    ]);
    return {
      ...mission,
      units: mission.units.filter((unit) => unit.id !== "u"),
    };
  }

  it("wakes the whole brood when a heavy gun fires within earshot of its zone, and no other", () => {
    const applied = applyWaking(
      ATTACK_HANDLER,
      gunnery(true),
      attack("h", "w"),
    );
    expect(brood(applied.state, "brood-a").woke?.cause).toBe("noise");
    expect(allAwake(applied.state, "brood-a")).toBe(true);
    expect(allAsleep(applied.state, "brood-b")).toBe(true);
  });

  it("sleeps through the same shot from a rifle: small arms are not loud", () => {
    const mission = gunnery(false);
    const applied = applyWaking(ATTACK_HANDLER, mission, attack("h", "w"));
    expect(allAsleep(applied.state, "brood-a")).toBe(true);
    expect(applied.events.some((event) => event.type === BROOD_WOKE)).toBe(
      false,
    );
  });

  it("sleeps through an explosion beyond earshot", () => {
    const mission = twoBroods();
    const applied = wakeBroods(
      mission,
      eventsOnly(mission, [blast("u", at(10, 20), 0)]),
      WAKE,
    );
    expect(allAsleep(applied.state, "brood-a")).toBe(true);
  });
});

describe("wakeBroods: bookkeeping", () => {
  it("returns the change itself, events unread, on a mission with nobody asleep", () => {
    const mission = missionWith(
      new FixtureMapBuilder(8, 8, 3).fillGround().build(),
      [
        unitAt("u", "infantry", at(1, 1)),
        unitAt("b", "infantry", at(5, 5), { team: "bugs" }),
      ],
    );
    const applied = eventsOnly(mission, [blast("u", at(5, 5), 2)]);
    expect(wakeBroods(mission, applied, WAKE)).toBe(applied);
  });

  it("wakes a hurt dormant bug that belongs to no brood on its own, announced as a status change", () => {
    const mission = twoBroods([sleeper("z", at(20, 20))]);
    const hurt = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === "z" ? { ...unit, hp: 4 } : unit,
      ),
    };
    const applied = wakeBroods(mission, eventsOnly(hurt, []), WAKE);
    expect(isDormant(unitOf(applied.state, "z"))).toBe(false);
    expect(applied.events).toEqual([
      { type: UNIT_STATUS_CHANGED, payload: { unitId: "z", status: [] } },
    ]);
    expect(allAsleep(applied.state, "brood-a")).toBe(true);
    expect(allAsleep(applied.state, "brood-b")).toBe(true);
  });

  it("never draws from the RNG: a wrapped attack leaves the stream where the bare rule leaves it", () => {
    const mission = {
      ...twoBroods(),
      units: twoBroods().units.map((unit) =>
        unit.id === "u" ? { ...unit, pos: at(10, 15) } : unit,
      ),
    };
    const bareRng = new Mulberry32Rng(42);
    const wrappedRng = new Mulberry32Rng(42);
    const bare = ATTACK_HANDLER(mission, attack("u", "a1"), {
      rng: bareRng,
      ids: new SequentialIdGenerator(),
    });
    const wrapped = withBroodWaking(ATTACK_HANDLER, WAKE)(
      mission,
      attack("u", "a1"),
      { rng: wrappedRng, ids: new SequentialIdGenerator() },
    );
    expect(wrappedRng.getState()).toEqual(bareRng.getState());
    if (!bare.ok || !wrapped.ok) throw new Error("the shot was refused");
    expect(unitOf(wrapped.value.state, "a1").hp).toBe(
      unitOf(bare.value.state, "a1").hp,
    );
    expect(wrapped.value.events.slice(0, bare.value.events.length)).toEqual(
      bare.value.events,
    );
  });

  it("is deterministic: the same change wakes the same broods the same way", () => {
    const mission = twoBroods();
    const change = eventsOnly(mission, [blast("u", at(10, 15), 2)]);
    expect(wakeBroods(mission, change, WAKE)).toEqual(
      wakeBroods(mission, change, WAKE),
    );
  });

  it("passes a refusal through untouched", () => {
    const refusal = err({ kind: "unit-not-found", unitId: "nobody" } as const);
    const handler: TacticalHandler = () => refusal;
    const outcome = withBroodWaking(handler, WAKE)(
      twoBroods(),
      move("u", []),
      ctxWith(riggedRng(true)),
    );
    expect(outcome).toBe(refusal);
  });

  it("wraps every handler of a table", () => {
    const wrapped = withBroodWakingAll({ "tactical:move": MOVE_HANDLER }, WAKE);
    const handler = wrapped["tactical:move"] as TacticalHandler;
    const outcome = handler(
      twoBroods(),
      move("u", [at(10, 17), at(10, 16), at(10, 15), at(10, 14), at(10, 13)]),
      ctxWith(riggedRng(true)),
    );
    if (!outcome.ok) throw new Error("the move was refused");
    expect(brood(outcome.value.state, "brood-a").woke?.cause).toBe("enter");
  });

  it("wakes from a phase step, stamping the phase it woke in, and that brood rests through the bug phase it woke in", () => {
    const mission = { ...twoBroods(), phase: "bugs" as const };
    const burn = wakingStep(
      (state) => ({
        state: {
          ...state,
          units: state.units.map((unit) =>
            unit.id === "a2" ? { ...unit, hp: 7 } : unit,
          ),
        },
        events: [],
      }),
      WAKE,
    );
    const opened = burn(mission, ctxWith(riggedRng(true)));
    expect(brood(opened.state, "brood-a").woke).toEqual({
      turn: 1,
      phase: "bugs",
      cause: "attack",
    });
    expect([...restingBugIds(opened.state)].sort()).toEqual([
      "a1",
      "a2",
      "a3",
      "b1",
      "b2",
    ]);
    const nextBugPhase = { ...opened.state, turn: 2 };
    expect([...restingBugIds(nextBugPhase)].sort()).toEqual(["b1", "b2"]);
  });

  it("wakeBrood wakes one brood on demand, once", () => {
    const mission = twoBroods();
    const woken = wakeBrood(mission, "brood-b", "noise");
    expect(allAwake(woken.state, "brood-b")).toBe(true);
    expect(allAsleep(woken.state, "brood-a")).toBe(true);
    expect(woken.events).toHaveLength(1);
    const again = wakeBrood(woken.state, "brood-b", "attack");
    expect(again).toEqual({ state: woken.state, events: [] });
  });
});

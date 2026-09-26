import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { SITREP_TUNING } from "../../data/sitrep-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import { DROP_SHIP_DEPARTED } from "../../model/drop-ship-departed-event";
import { endTurn } from "../../model/end-turn-command";
import { MISSION_ENDED } from "../../model/mission-ended-event";
import type { TacticalState } from "../../model/tactical-state";
import { UNIT_ABANDONED } from "../../model/unit-abandoned-event";
import { waveInterval } from "../spawn-service";
import { unitAt } from "../tactical-fixtures.test-helper";
import { createEndTurnHandler, DEFAULT_PHASE_STEPS } from "../turn-service";
import {
  departIfDue,
  dustOffTurnFor,
  dustOffWindowSitrep,
  openWindow,
} from "./dust-off-window-sitrep";
import { EXTRACTION, fieldMission } from "./sitrep-fixtures.test-helper";
import { sitrepPhaseSteps } from "./sitrep-service";

// ===========================================
// Fixtures
// ===========================================

const TUNING = SITREP_TUNING.dustOffWindow;

/** The sitrep field with its extraction tiles set, as a mission start leaves it. */
function withShip(extra: Partial<TacticalState> = {}): TacticalState {
  return fieldMission(["dust-off-window"], {
    extraction: EXTRACTION,
    ...extra,
  });
}

/** A map `side` tiles square. */
const square = (side: number) => ({ width: side, depth: side });

// ===========================================
// Rule
// ===========================================

describe("dustOffWindowSitrep", () => {
  it("has a setup and a phase step, and no sight hook", () => {
    const rule = dustOffWindowSitrep(TUNING, SPAWN_TUNING);
    expect(rule.id).toBe("dust-off-window");
    expect(rule.setup).toBeDefined();
    expect(rule.phaseStep).toBeDefined();
    expect(rule.sight).toBeUndefined();
  });

  it("ships 8 turns plus one per 12 tiles of width and depth, and 12 after a defence's last wave", () => {
    expect(TUNING).toEqual({
      baseTurns: 8,
      tilesPerTurn: 12,
      turnsAfterLastWave: 12,
    });
  });
});

// ===========================================
// Setup
// ===========================================

describe("dustOffTurnFor", () => {
  it("gives a small map 16 turns, a medium one 20 and a large one 24", () => {
    const open = withShip();
    expect(dustOffTurnFor(open, square(48), TUNING, SPAWN_TUNING)).toBe(16);
    expect(dustOffTurnFor(open, square(72), TUNING, SPAWN_TUNING)).toBe(20);
    expect(dustOffTurnFor(open, square(96), TUNING, SPAWN_TUNING)).toBe(24);
    // Rounded up: 49 + 48 = 97 tiles is a ninth turn's worth.
    expect(
      dustOffTurnFor(open, { width: 49, depth: 48 }, TUNING, SPAWN_TUNING),
    ).toBe(17);
  });

  it("keeps twelve turns after a defence's last wave when that is later", () => {
    // Five waves from turn 3, every waveInterval turns: the last lands on 19.
    const interval = waveInterval(1, 0, SPAWN_TUNING);
    const defence = withShip({
      edgeSpawn: { nextTurn: 3, wave: 0, totalWaves: 5 },
    });
    expect(dustOffTurnFor(defence, square(48), TUNING, SPAWN_TUNING)).toBe(
      3 + 4 * interval + 12,
    );
    // Two left of five from turn 11: the last lands on 11 + interval.
    const halfway = withShip({
      edgeSpawn: { nextTurn: 11, wave: 3, totalWaves: 5 },
    });
    expect(dustOffTurnFor(halfway, square(48), TUNING, SPAWN_TUNING)).toBe(
      11 + interval + 12,
    );
    // One wave on turn 3: 15 is sooner than the map's 16, so 16.
    const short = withShip({
      edgeSpawn: { nextTurn: 3, wave: 0, totalWaves: 1 },
    });
    expect(dustOffTurnFor(short, square(48), TUNING, SPAWN_TUNING)).toBe(16);
    // Every wave landed: the map's size alone.
    const done = withShip({
      edgeSpawn: { nextTurn: 23, wave: 5, totalWaves: 5 },
    });
    expect(dustOffTurnFor(done, square(48), TUNING, SPAWN_TUNING)).toBe(16);
  });
});

describe("openWindow", () => {
  it("sets the ship's last turn from the map, and changes nothing else", () => {
    const mission = withShip();
    const opened = openWindow(mission, mission.map, TUNING, SPAWN_TUNING);
    // The 24 × 24 field: 8 + ⌈48 / 12⌉.
    expect(opened.dustOffTurn).toBe(12);
    expect({ ...opened, dustOffTurn: undefined }).toEqual({
      ...mission,
      dustOffTurn: undefined,
    });
  });

  it("does nothing on a map with no extraction: there is no ship to leave", () => {
    const mission = fieldMission(["dust-off-window"]);
    expect(mission.extraction).toEqual([]);
    expect(openWindow(mission, mission.map, TUNING, SPAWN_TUNING)).toBe(
      mission,
    );
  });
});

// ===========================================
// Departure
// ===========================================

describe("departIfDue", () => {
  it("waits through its last turn, and leaves nothing behind before it has ended", () => {
    for (const turn of [1, 11, 12]) {
      const mission = withShip({ dustOffTurn: 12, turn });
      expect(departIfDue(mission)).toEqual({ state: mission, events: [] });
    }
    const none = withShip({ turn: 40 });
    expect(departIfDue(none).state).toBe(none);
  });

  it("leaves once its turn has ended, stranding everyone still on the map", () => {
    const aboard = unitAt("squad-2", "infantry", EXTRACTION[0]!);
    const mission = withShip({
      dustOffTurn: 12,
      turn: 13,
      extracted: [aboard],
    });
    const departed = departIfDue(mission);
    expect(departed.events).toEqual([
      { type: DROP_SHIP_DEPARTED, payload: { turn: 12, leftBehind: 2 } },
      { type: UNIT_ABANDONED, payload: { unitId: "mech-1" } },
      { type: UNIT_ABANDONED, payload: { unitId: "squad-1" } },
    ]);
    expect(departed.state.units.map((unit) => unit.hp)).toEqual([0, 0]);
    expect(departed.state.extracted).toEqual([aboard]);
    expect(departed.state.outcome).toBeUndefined();
  });
});

describe("on EndTurn", () => {
  const handler = createEndTurnHandler([
    ...DEFAULT_PHASE_STEPS,
    ...sitrepPhaseSteps(),
  ]);
  const ctx = () => ({
    rng: new Mulberry32Rng(1),
    ids: new SequentialIdGenerator(),
  });

  it("ends the mission when the bugs' phase of the last turn ends, on whoever boarded", () => {
    const aboard = unitAt("squad-2", "infantry", EXTRACTION[0]!);
    const mission = withShip({
      dustOffTurn: 12,
      turn: 12,
      phase: "bugs",
      extracted: [aboard],
    });
    const result = handler(mission, endTurn(), ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state, events } = result.value;
    expect(state.turn).toBe(13);
    expect(state.outcome).toBe("extracted");
    const types = events.map((event) => event.type);
    expect(types.indexOf(DROP_SHIP_DEPARTED)).toBeLessThan(
      types.indexOf(UNIT_ABANDONED),
    );
    expect(types.at(-1)).toBe(MISSION_ENDED);
    expect(types.filter((type) => type === UNIT_ABANDONED)).toHaveLength(2);
  });

  it("is lost when nobody boarded, and the player's own End Turn inside the window changes nothing", () => {
    const stranded = withShip({ dustOffTurn: 12, turn: 12, phase: "bugs" });
    const result = handler(stranded, endTurn(), ctx());
    expect(result.ok && result.value.state.outcome).toBe("lost");
    const inside = withShip({ dustOffTurn: 12, turn: 12 });
    const bugs = handler(inside, endTurn(), ctx());
    expect(bugs.ok && bugs.value.state.phase).toBe("bugs");
    expect(bugs.ok && bugs.value.state.outcome).toBeUndefined();
  });
});

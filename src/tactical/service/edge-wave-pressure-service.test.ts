import { describe, expect, it } from "vitest";

import type { EdgeWavePressure } from "../model/wave-pressure-tuning";
import type { EdgeSpawnSchedule, TacticalState } from "../model/tactical-state";
import { FIRST_TURN } from "../model/tactical-state";
import { pressEdgeWaves } from "./edge-wave-pressure-service";
import { missionWith, openField } from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** Waves twice the size, spilling two steps, the first a turn sooner. */
const PRESSURE: EdgeWavePressure = {
  surge: { sizeScale: 2, spillRadius: 2 },
  turnsSooner: 1,
};

/** A mission on an open field whose edge schedule is `edgeSpawn`. */
function scheduled(edgeSpawn: EdgeSpawnSchedule): TacticalState {
  return missionWith(openField().build(), [], { edgeSpawn });
}

// ===========================================
// Tests
// ===========================================

describe("pressEdgeWaves (#1179)", () => {
  it("surges every wave and brings the first sooner, keeping the wave count", () => {
    const mission = scheduled({ nextTurn: 3, wave: 0, totalWaves: 5 });
    expect(pressEdgeWaves(mission, PRESSURE).edgeSpawn).toEqual({
      nextTurn: 2,
      wave: 0,
      totalWaves: 5,
      surge: { sizeScale: 2, spillRadius: 2 },
    });
  });

  it("leaves the first wave's turn alone with no turns sooner, and never brings it before the first turn", () => {
    const mission = scheduled({ nextTurn: 3, wave: 0 });
    expect(
      pressEdgeWaves(mission, { ...PRESSURE, turnsSooner: 0 }).edgeSpawn
        .nextTurn,
    ).toBe(3);
    const early = scheduled({ nextTurn: FIRST_TURN, wave: 0 });
    expect(pressEdgeWaves(early, PRESSURE).edgeSpawn.nextTurn).toBe(FIRST_TURN);
  });

  it("keeps the larger size scale and the larger spill of a surge already set, each on its own", () => {
    const larger = scheduled({
      nextTurn: 3,
      wave: 0,
      surge: { sizeScale: 3, spillRadius: 1 },
    });
    expect(pressEdgeWaves(larger, PRESSURE).edgeSpawn.surge).toEqual({
      sizeScale: 3,
      spillRadius: 2,
    });
    const smaller = scheduled({
      nextTurn: 3,
      wave: 0,
      surge: { sizeScale: 1.5, spillRadius: 3 },
    });
    expect(pressEdgeWaves(smaller, PRESSURE).edgeSpawn.surge).toEqual({
      sizeScale: 2,
      spillRadius: 3,
    });
  });

  it("changes nothing but the schedule, and never mutates the mission", () => {
    const mission = scheduled({ nextTurn: 3, wave: 1 });
    const before = structuredClone(mission);
    const pressed = pressEdgeWaves(mission, PRESSURE);
    expect({ ...pressed, edgeSpawn: mission.edgeSpawn }).toEqual(mission);
    expect(mission).toEqual(before);
  });
});

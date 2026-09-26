import { describe, expect, it } from "vitest";

import { SITREP_TUNING } from "../../data/sitrep-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import { fieldMission } from "./sitrep-fixtures.test-helper";
import { raiseTide, swarmTideSitrep } from "./swarm-tide-sitrep";

// ===========================================
// Fixtures
// ===========================================

const TUNING = SITREP_TUNING.swarmTide;

// ===========================================
// Rule
// ===========================================

describe("swarmTideSitrep", () => {
  it("has a setup and nothing else", () => {
    const rule = swarmTideSitrep(TUNING);
    expect(rule.id).toBe("swarm-tide");
    expect(rule.setup).toBeDefined();
    expect(rule.sight).toBeUndefined();
    expect(rule.phaseStep).toBeUndefined();
  });

  it("ships waves 50% larger, spilling two steps, the first a turn sooner", () => {
    expect(TUNING).toEqual({ sizeScale: 1.5, turnsSooner: 1, spillRadius: 2 });
  });
});

describe("raiseTide", () => {
  it("brings the first wave a turn forward and puts the surge on the schedule", () => {
    const mission = fieldMission(["swarm-tide"], {
      edgeSpawn: { nextTurn: SPAWN_TUNING.firstWaveTurn, wave: 0 },
    });
    expect(raiseTide(mission, TUNING).edgeSpawn).toEqual({
      nextTurn: SPAWN_TUNING.firstWaveTurn - 1,
      wave: 0,
      surge: { sizeScale: 1.5, spillRadius: 2 },
    });
  });

  it("keeps a defence's wave total, and never brings a wave before the first turn", () => {
    const defence = fieldMission(["swarm-tide"], {
      edgeSpawn: { nextTurn: 3, wave: 0, totalWaves: 5 },
    });
    expect(raiseTide(defence, TUNING).edgeSpawn.totalWaves).toBe(5);
    const early = fieldMission(["swarm-tide"], {
      edgeSpawn: { nextTurn: 1, wave: 0 },
    });
    expect(raiseTide(early, TUNING).edgeSpawn.nextTurn).toBe(1);
  });

  it("changes nothing but the schedule, and never mutates the mission", () => {
    const mission = fieldMission(["swarm-tide"]);
    const before = structuredClone(mission);
    const raised = raiseTide(mission, TUNING);
    expect({ ...raised, edgeSpawn: mission.edgeSpawn }).toEqual(mission);
    expect(mission).toEqual(before);
  });
});

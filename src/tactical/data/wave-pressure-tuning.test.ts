import { describe, expect, it } from "vitest";

import { SITREP_TUNING } from "./sitrep-tuning";
import { WAVE_PRESSURE_TUNING } from "./wave-pressure-tuning";

describe("WAVE_PRESSURE_TUNING (#1179)", () => {
  it("ships the calibrated pressure of the defence, the wreck, and the tunnels in Act III alone", () => {
    expect(WAVE_PRESSURE_TUNING).toEqual({
      defence: { surge: { sizeScale: 1.75, spillRadius: 2 }, turnsSooner: 0 },
      wreck: { surge: { sizeScale: 3, spillRadius: 3 }, turnsSooner: 1 },
      tunnels: {
        surge: { sizeScale: 1.1, spillRadius: 1 },
        turnsSooner: 2,
        onlyInAct: "act-3",
      },
    });
  });

  it("presses every type it names on the whole type, but the tunnels, whose Act II stays on the shared waves", () => {
    const { defence, wreck, tunnels } = WAVE_PRESSURE_TUNING;
    expect(defence.onlyInAct).toBeUndefined();
    expect(wreck.onlyInAct).toBeUndefined();
    expect(tunnels.onlyInAct).toBe("act-3");
  });

  // The tunnels' Act III press is milder than the tide (a tenth larger,
  // a step of spill); the tide on top keeps the larger of each, so a
  // tunnel under Swarm Tide lands the tide's waves.
  it("surges the defence's and the wreck's waves at least as hard as Swarm Tide, so the tide still reads", () => {
    const { defence, wreck } = WAVE_PRESSURE_TUNING;
    for (const pressure of [defence, wreck]) {
      expect(pressure.surge.sizeScale).toBeGreaterThan(1);
      expect(pressure.surge.spillRadius).toBeGreaterThanOrEqual(
        SITREP_TUNING.swarmTide.spillRadius,
      );
    }
  });
});

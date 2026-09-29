import { describe, expect, it } from "vitest";

import { SITREP_TUNING } from "./sitrep-tuning";
import { WAVE_PRESSURE_TUNING } from "./wave-pressure-tuning";

describe("WAVE_PRESSURE_TUNING (#1179)", () => {
  it("ships the calibrated pressure of the defence and the wreck, and none on the tunnels", () => {
    expect(WAVE_PRESSURE_TUNING).toEqual({
      defence: { surge: { sizeScale: 1.75, spillRadius: 2 }, turnsSooner: 0 },
      wreck: { surge: { sizeScale: 3, spillRadius: 3 }, turnsSooner: 1 },
    });
  });

  it("surges every pressed type's waves at least as hard as Swarm Tide, so the tide still reads", () => {
    const { defence, wreck } = WAVE_PRESSURE_TUNING;
    for (const pressure of [defence, wreck]) {
      expect(pressure.surge.sizeScale).toBeGreaterThan(1);
      expect(pressure.surge.spillRadius).toBeGreaterThanOrEqual(
        SITREP_TUNING.swarmTide.spillRadius,
      );
    }
  });
});

import { describe, expect, it } from "vitest";

import { CRASH_SITE_SETUP_TUNING } from "./crash-site-setup-tuning";
import { SPAWN_TUNING } from "./spawn-tuning";

describe("CRASH_SITE_SETUP_TUNING (campaign arc §6.3)", () => {
  it("ripens the pod at the end of turn 5 from d5, and leaves d1–4 on the shared turn 8 (C2b-1-field)", () => {
    // Crash-site calibration (#1179): both players kill the pod on
    // turn 2–8, so the clock is what makes a harder landing harder.
    // First Skyfall is d1 and must not move.
    expect(CRASH_SITE_SETUP_TUNING.earlyMaturityFromDifficulty).toBe(5);
    expect(CRASH_SITE_SETUP_TUNING.earlyMaturityTurn).toBe(5);
    expect(SPAWN_TUNING.podMaturityTurn).toBe(8);
  });
});

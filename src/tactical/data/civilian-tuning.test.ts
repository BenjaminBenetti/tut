import { describe, expect, it } from "vitest";

import { CIVILIAN_TUNING } from "./civilian-tuning";

describe("CIVILIAN_TUNING (campaign arc §6.4)", () => {
  it("gives a group twenty hit points, so it lives through about seven swarmer bites (C2b-1-field)", () => {
    // Evacuation calibration (#1179): at 10 hp the walk home killed
    // about half of the groups freed 60–80 steps out.
    expect(CIVILIAN_TUNING.maxHp).toBe(20);
    expect(CIVILIAN_TUNING.armor).toBe(0);
  });

  it("walks a group six tiles an action, faster than the squad that freed it (C2b-1-field)", () => {
    // Evacuation calibration (#1179): the move shortens the walk home
    // for both players' groups.
    expect(CIVILIAN_TUNING.move).toBe(6);
    expect(CIVILIAN_TUNING.maxAp).toBe(2);
  });
});

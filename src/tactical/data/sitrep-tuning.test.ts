import { describe, expect, it } from "vitest";

import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import { HAZARD_TUNING } from "./hazard-tuning";
import { SITREP_TUNING } from "./sitrep-tuning";
import { UNIT_TUNING } from "./unit-tuning";

describe("SITREP_TUNING", () => {
  it("prices Salvage Rich's carcasses the way the offer prices its own (#1171)", () => {
    expect(SITREP_TUNING.salvageRich.basePoints).toBe(
      MISSION_TUNING.techCarcass.basePoints,
    );
    expect(SITREP_TUNING.salvageRich.pointsPerDifficulty).toBe(
      MISSION_TUNING.techCarcass.pointsPerDifficulty,
    );
    expect(SITREP_TUNING.salvageRich.carcasses).toBe(2);
  });

  it("takes four off sight and floors it below every shipped range", () => {
    expect(SITREP_TUNING.nightfall.sightPenalty).toBe(4);
    expect(SITREP_TUNING.nightfall.sightFloor).toBeLessThan(
      Math.min(UNIT_TUNING.infantry.sightRange, UNIT_TUNING.mech.sightRange) -
        SITREP_TUNING.nightfall.sightPenalty,
    );
  });

  it("keeps spore smoke longer than a grenade's, and fires relighting after they burn out", () => {
    expect(SITREP_TUNING.sporeFog.phases).toBeGreaterThan(
      HAZARD_TUNING.effects.smoke.duration,
    );
    // Two phases a turn: a fire lit on turn 1 is out before turn 1 + period.
    expect(HAZARD_TUNING.effects.fire.duration).toBeLessThanOrEqual(
      2 * SITREP_TUNING.cityAblaze.rekindleEvery,
    );
  });

  it("spaces clouds so no two overlap", () => {
    const fog = SITREP_TUNING.sporeFog;
    expect(fog.spacing).toBeGreaterThan(2 * fog.radius);
  });
});

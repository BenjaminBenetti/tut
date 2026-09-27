import { describe, expect, it } from "vitest";

import { ALL_SQUAD_TYPES_AVAILABLE } from "../../roster/model/squad-type-availability";
import { createSquadTypeAvailability } from "../../tech/service/squad-type-availability-service";
import {
  fillDeployment,
  fillLine,
  fillMarket,
} from "./calibration-fill.test-helper";
import { composeCalibrationGame } from "./calibration-run.test-helper";

describe("the calibration fill", () => {
  const { content } = composeCalibrationGame(1);
  const noResearch = createSquadTypeAvailability(content.tech, {
    unlocked: [],
  });
  /** The shipped types a campaign with no research hires, and a mech at `mechCost`. */
  const market = (mechCost: number) =>
    fillMarket(content.squadTypes, noResearch, mechCost);

  it("keeps one slot for a medic when the bank covers a mech in every slot", () => {
    const fill = fillDeployment(66_585, 3, market(11_750));
    expect(fill).toEqual({
      mechs: 2,
      squads: ["medic"],
      bankBefore: 66_585,
      bankAfter: 66_585 - 2 * 11_750 - 600,
    });
  });

  it("buys a mech only while the bank still covers a hire for every slot after it", () => {
    // 3,950 buys one mech and leaves 1,100: a medic and a rifle squad.
    const fill = fillDeployment(3_950, 3, market(2_850));
    expect(fill.mechs).toBe(1);
    expect(fill.squads).toEqual(["medic", "rifle"]);
    expect(fill.bankAfter).toBe(0);
    // 3,400 would buy the mech but leave 550, short of a hire for each
    // of the two slots after it, so the fill hires squads instead.
    const short = fillDeployment(3_400, 3, market(2_850));
    expect(short.mechs).toBe(0);
    expect(short.squads).toEqual(["medic", "rocket", "rocket"]);
    expect(short.bankAfter).toBe(1_300);
  });

  it("hires the best-rated squad the bank covers once no mech fits", () => {
    // After the medic, 1,400 buys a rocket squad (56) and keeps 500 for
    // the last slot, where only the rifle (40) is still covered.
    const fill = fillDeployment(2_000, 3, market(2_850));
    expect(fill.mechs).toBe(0);
    expect(fill.squads).toEqual(["medic", "rocket", "rifle"]);
    expect(fill.bankAfter).toBe(150);
  });

  it("hires only the types the band's research opens", () => {
    const locked = fillDeployment(1_500, 2, market(99_999));
    expect(locked.squads).toEqual(["medic", "rocket"]);
    const open = fillDeployment(
      1_500,
      2,
      fillMarket(content.squadTypes, ALL_SQUAD_TYPES_AVAILABLE, 99_999),
    );
    expect(open.squads).toEqual(["medic", "heavy-weapons"]);
    expect(open.bankAfter).toBe(0);
  });

  it("leaves a slot empty when nothing is covered, and buys nothing with no slot open", () => {
    expect(fillDeployment(400, 3, market(2_850))).toEqual({
      mechs: 0,
      squads: [],
      bankBefore: 400,
      bankAfter: 400,
    });
    expect(fillDeployment(66_585, 0, market(11_750)).squads).toEqual([]);
    expect(fillDeployment(66_585, 0, market(11_750)).mechs).toBe(0);
  });

  it("says what it bought in one line", () => {
    const fill = fillDeployment(34_988, 3, market(4_400));
    expect(fillLine(fill, market(4_400))).toBe(
      "2 mechs at 4400 + medic: bank 34988 → 25588",
    );
  });
});

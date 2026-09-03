import { describe, expect, it } from "vitest";

import { MECH_RATING_TUNING } from "../data/mech-rating-tuning";
import { UPGRADE_TUNING } from "../data/upgrade-tuning";
import { STARTER_PARTS } from "../data/parts";
import { STARTER_LOADOUT } from "../data/starter-roster";
import { StaticPartCatalogue } from "../repository/static-part-catalogue";
import { LoadoutMechRater } from "./loadout-mech-rater";
import { validateLoadout } from "./loadout-validation-service";
import { createMech } from "./mech-factory";

const CATALOGUE = new StaticPartCatalogue(STARTER_PARTS);

describe("LoadoutMechRater", () => {
  it("rates a valid mech by its stat sheet", () => {
    const rater = new LoadoutMechRater(
      CATALOGUE,
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    const mech = createMech(STARTER_LOADOUT, "mech-1", "Hammerhead");
    const sheet = validateLoadout(
      STARTER_LOADOUT,
      CATALOGUE,
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    expect(sheet.ok).toBe(true);
    if (sheet.ok) {
      expect(rater.rateMech(mech)).toBe(sheet.value.combatRating);
      expect(rater.rateMech(mech)).toBeGreaterThan(0);
    }
  });

  it("ignores accumulated damage", () => {
    const rater = new LoadoutMechRater(
      CATALOGUE,
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    const fresh = createMech(STARTER_LOADOUT, "mech-1", "A");
    const battered = { ...fresh, damage: 90 };
    expect(rater.rateMech(battered)).toBe(rater.rateMech(fresh));
  });

  it("rates an unbuildable loadout at zero", () => {
    const rater = new LoadoutMechRater(
      CATALOGUE,
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    const mech = createMech(
      { ...STARTER_LOADOUT, chassisId: "chassis-missing" },
      "mech-1",
      "Ghost",
    );
    expect(rater.rateMech(mech)).toBe(0);
  });
});

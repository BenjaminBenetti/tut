import { describe, expect, it } from "vitest";

import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { wreckOf } from "../../../overworld/service/wreck-service";
import { STARTER_PARTS } from "../../../roster/data/parts";
import { STARTER_LOADOUT } from "../../../roster/data/starter-roster";
import { StaticPartCatalogue } from "../../../roster/repository/static-part-catalogue";
import { createMech } from "../../../roster/service/mech-factory";
import {
  campaignOnDay,
  missionAt,
} from "../../view/mission-fixtures.test-helper";
import { missionCountdownText } from "../mission-countdown";
import { MISSION_PRESENTATION } from "./mission-presentation";
import {
  createWreckRecoveryPresentation,
  partNames,
} from "./wreck-recovery-presentation";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);
const PRESENTATION = createWreckRecoveryPresentation(PARTS);

/** Anvil, a starter mech with a second radiator, so a part repeats. */
const ANVIL = createMech(
  { ...STARTER_LOADOUT, utilityIds: ["utility-radiator", "utility-radiator"] },
  "mech-2",
  "Anvil",
);

/** Anvil's recovery offered on day 5, lapsing on day 8. */
const RECOVERY: Mission = {
  ...missionAt("mission-3", "cairo", 8, 4),
  typeId: "wreck-recovery",
  createdDay: 5,
  wreck: wreckOf(ANVIL, missionAt("mission-1", "cairo", 4), 4, 2),
};

const CTX = { state: campaignOnDay(5, [RECOVERY]) };

/** A recovery's result ending in `outcome` with the strip as given. */
function result(
  outcome: MissionResult["outcome"],
  turnsWorked: number,
  partsAwarded?: readonly string[],
): MissionResult {
  return {
    missionId: RECOVERY.id,
    cityId: "cairo",
    outcome,
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed: [],
    mechDamage: [],
    creditsAwarded: 0,
    techPointsAwarded: 0,
    infestationDelta: 0,
    wreck: { stripped: turnsWorked >= 2, turnsWorked, turnsNeeded: 2 },
    ...(partsAwarded === undefined ? {} : { partsAwarded }),
  };
}

// ===========================================
// Presentation
// ===========================================

describe("wreck recovery presentation", () => {
  it("is the shipped table's entry, with the mech glyph", () => {
    expect(MISSION_PRESENTATION["wreck-recovery"].typeId).toBe(
      "wreck-recovery",
    );
    expect(MISSION_PRESENTATION["wreck-recovery"].icon).toBe("mech");
  });

  it("briefs whose parts come home, which parts by name, and the strip time", () => {
    expect(PRESENTATION.briefingRows(RECOVERY, CTX)).toEqual([
      {
        field: "wreck",
        label: "Wreck",
        value: "Recover Anvil's parts: 6 parts",
      },
      {
        field: "parts",
        label: "Parts",
        value: partNames(RECOVERY.wreck?.parts ?? [], PARTS),
      },
      {
        field: "strip",
        label: "Strip time",
        value: "2 turns by an infantry squad",
      },
    ]);
    expect(
      MISSION_PRESENTATION["wreck-recovery"].briefingRows(RECOVERY, CTX),
    ).toEqual(PRESENTATION.briefingRows(RECOVERY, CTX));
  });

  it("names parts from the catalogue, counting a repeat once with ×N", () => {
    const names = partNames(
      ["legs-strider", "utility-radiator", "utility-radiator"],
      PARTS,
    );
    const legs = PARTS.getPart("legs-strider")?.name ?? "";
    const radiator = PARTS.getPart("utility-radiator")?.name ?? "";
    expect(legs).not.toBe("");
    expect(names).toBe(`${legs}, ${radiator} ×2`);
    expect(partNames([], PARTS)).toBe("none");
    expect(partNames(["part-gone"], PARTS)).toBe("part-gone");
  });

  it("briefs nothing of its own for an offer that lost its record", () => {
    const { wreck: _dropped, ...bare } = RECOVERY;
    expect(PRESENTATION.briefingRows(bare, CTX)).toEqual([]);
  });

  it("shows the offer's three days on its countdown", () => {
    expect(missionCountdownText(RECOVERY, 5)).toBe("3 d");
    expect(missionCountdownText(RECOVERY, 7)).toBe("1 d");
  });

  it("says whether the parts came home", () => {
    const tagline = (outcome: MissionResult): string | undefined =>
      PRESENTATION.debriefTagline?.(outcome, CTX);
    expect(
      tagline(result("won", 2, ["legs-strider", "utility-radiator"])),
    ).toBe(
      "The wreck was stripped and the parts are coming home: 2 parts go to the stock.",
    );
    expect(tagline(result("extracted", 2))).toBe(
      "The wreck was stripped, but the parts never reached the drop ship. They are lost with it.",
    );
    expect(tagline(result("lost", 1))).toBe(
      "The wreck was worked 1 of 2 turns. Its parts are lost.",
    );
    const { wreck: _none, ...other } = result("won", 2);
    expect(tagline(other)).toBeUndefined();
  });
});

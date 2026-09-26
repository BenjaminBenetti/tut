import { describe, expect, it } from "vitest";

import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import {
  campaignOnDay,
  missionAt,
} from "../../view/mission-fixtures.test-helper";
import {
  ALPHA_HUNT_PRESENTATION,
  createAlphaHuntPresentation,
  nemesisLine,
} from "./alpha-hunt-presentation";
import {
  debriefTaglineFor,
  MISSION_PRESENTATION,
} from "./mission-presentation";

// ===========================================
// Fixtures
// ===========================================

/** A first meeting: a name and no scar. */
const FRESH: Mission = {
  ...missionAt("mission-1", "cairo", 7, 4),
  typeId: "alpha-hunt",
  alphaHunt: { name: "Mother Grist", scars: 0 },
};

/** A nemesis come back: the name, the scar and the level she carries. */
const NEMESIS: Mission = {
  ...FRESH,
  alphaHunt: {
    nemesisId: "nemesis-old-scald",
    name: "Old Scald",
    scar: "burned along the flank",
    scars: 1,
    level: 2,
  },
};

const CTX = { state: campaignOnDay(4, [FRESH]) };

/** A played hunt's result. */
function played(
  outcome: MissionResult["outcome"],
  killed: boolean,
  escaped: boolean,
): MissionResult {
  return {
    missionId: "mission-1",
    cityId: "cairo",
    outcome,
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed: [],
    mechDamage: [],
    creditsAwarded: 0,
    techPointsAwarded: 0,
    infestationDelta: 0,
    broodmotherKilled: killed,
    broodmotherEscaped: escaped,
  };
}

/** The value of each row, by field. */
function valuesOf(mission: Mission): Record<string, string> {
  return Object.fromEntries(
    ALPHA_HUNT_PRESENTATION.briefingRows(mission, CTX).map((row) => [
      row.field,
      row.value,
    ]),
  );
}

// ===========================================
// Tests
// ===========================================

describe("ALPHA_HUNT_PRESENTATION (campaign arc §6.8, #1179)", () => {
  it("is the table's alpha-hunt entry, under the nemesis crown", () => {
    expect(MISSION_PRESENTATION["alpha-hunt"]).toBe(ALPHA_HUNT_PRESENTATION);
    expect(ALPHA_HUNT_PRESENTATION.icon).toBe("nemesis");
  });

  it("briefs a first meeting by her name, how she fights and what her escape costs", () => {
    expect(valuesOf(FRESH)).toEqual({
      quarry: "Kill Mother Grist before she reaches the map edge",
      broodmother: "She lays a clutch every 3 turns and flees at half health",
      escaped: "She returns stronger",
    });
  });

  it("names a nemesis' scar and level on a row of its own", () => {
    expect(
      ALPHA_HUNT_PRESENTATION.briefingRows(NEMESIS, CTX).map((row) => [
        row.label,
        row.value,
      ]),
    ).toEqual([
      ["Quarry", "Kill Old Scald before she reaches the map edge"],
      ["Nemesis", "Old Scald, scarred: burned along the flank. Level 2"],
      [
        "Broodmother",
        "She lays a clutch every 3 turns and flees at half health",
      ],
      ["Escaped", "She returns stronger"],
    ]);
  });

  it("keeps the rules and drops her name for an offer without its spec", () => {
    const { alphaHunt: _dropped, ...bare } = FRESH;
    expect(Object.keys(valuesOf(bare))).toEqual(["broodmother", "escaped"]);
  });

  it("quotes the tuning it is built over", () => {
    const tuned = createAlphaHuntPresentation({
      broodmother: { clutchInterval: 4, fleeAtHpFraction: 0.4 },
      hunt: { growthPauseDays: 7 },
    });
    expect(
      tuned.briefingRows(FRESH, CTX).find((row) => row.field === "broodmother")
        ?.value,
    ).toBe("She lays a clutch every 4 turns and flees at 40% health");
    expect(tuned.debriefTagline?.(played("won", true, false), CTX)).toBe(
      "The Broodmother is dead and the force is coming home. Her region's growth holds for 7 days.",
    );
  });
});

describe("nemesisLine", () => {
  it("reads a nemesis as the briefing prints it, and nothing for a first meeting", () => {
    expect(
      nemesisLine({ name: "Old Scald", scar: "a leg lost", level: 1 }),
    ).toBe("Old Scald, scarred: a leg lost. Level 1");
    expect(nemesisLine({ name: "Mother Grist" })).toBeUndefined();
    expect(nemesisLine({ name: "Mother Grist", level: 1 })).toBeUndefined();
  });
});

describe("the hunt's debrief", () => {
  it("says she died, and whether the force came home", () => {
    expect(debriefTaglineFor(played("won", true, false), CTX)).toBe(
      "The Broodmother is dead and the force is coming home. Her region's growth holds for 5 days.",
    );
    expect(debriefTaglineFor(played("lost", true, false), CTX)).toBe(
      "The Broodmother is dead, but the force did not make it home. Her region's growth holds for 5 days.",
    );
  });

  it("says she escaped, or outlived the force, and will return stronger", () => {
    expect(debriefTaglineFor(played("extracted", false, true), CTX)).toBe(
      "The Broodmother reached the map edge. She will return stronger.",
    );
    expect(debriefTaglineFor(played("lost", false, false), CTX)).toBe(
      "The force is lost and the Broodmother lives. She will return stronger.",
    );
    expect(debriefTaglineFor(played("extracted", false, false), CTX)).toBe(
      "The force pulled out and the Broodmother lives. She will return stronger.",
    );
  });

  it("leaves a result without a hunt to its outcome's line", () => {
    const {
      broodmotherKilled: _k,
      broodmotherEscaped: _e,
      ...other
    } = played("won", true, false);
    expect(
      ALPHA_HUNT_PRESENTATION.debriefTagline?.(other, CTX),
    ).toBeUndefined();
    expect(debriefTaglineFor(other, CTX)).toBeUndefined();
  });
});

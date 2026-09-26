import { describe, expect, it } from "vitest";

import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import {
  campaignOnDay,
  missionAt,
} from "../../view/mission-fixtures.test-helper";
import { MISSION_PRESENTATION } from "./mission-presentation";
import { TUNNEL_SABOTAGE_PRESENTATION } from "./tunnel-sabotage-presentation";

// ===========================================
// Fixtures
// ===========================================

/** Cairo's sabotage, offered on day 4 with its spread due on day 6. */
const SABOTAGE: Mission = {
  ...missionAt("mission-5", "cairo", 6, 5),
  typeId: "tunnel-sabotage",
  createdDay: 4,
  tunnelSabotage: { cityId: "cairo", spreadDueDay: 6 },
};

/** The campaign on `day`, with the sabotage on offer. */
function ctxOn(day: number) {
  return { state: campaignOnDay(day, [SABOTAGE]) };
}

/** A sabotage's result ending in `outcome` with `sealed` of three mouths sealed. */
function result(
  outcome: MissionResult["outcome"],
  sealed: number,
): MissionResult {
  return {
    missionId: SABOTAGE.id,
    cityId: "cairo",
    outcome,
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed: [],
    mechDamage: [],
    creditsAwarded: 0,
    techPointsAwarded: 0,
    infestationDelta: 0,
    tunnelsSealed: sealed,
    tunnelsTotal: 3,
  };
}

// ===========================================
// Presentation
// ===========================================

describe("tunnel sabotage presentation (arc §6.7)", () => {
  it("is the shipped table's entry, with the tunnel glyph", () => {
    expect(MISSION_PRESENTATION["tunnel-sabotage"]).toBe(
      TUNNEL_SABOTAGE_PRESENTATION,
    );
    expect(TUNNEL_SABOTAGE_PRESENTATION.icon).toBe("tunnel");
  });

  it("briefs the task, the fuse, the spread's day, and what a win or a pass does to the city", () => {
    expect(
      TUNNEL_SABOTAGE_PRESENTATION.briefingRows(SABOTAGE, ctxOn(4)),
    ).toEqual([
      {
        field: "tunnels",
        label: "Tunnels",
        value: "Seal 3 tunnel mouths, then extract",
      },
      { field: "fuse", label: "Fuse", value: "Charges burn for 3 turns" },
      { field: "spread", label: "Spread due", value: "In 2 days" },
      {
        field: "if-won",
        label: "Win",
        value: "Cairo cannot spread for 10 days",
      },
      { field: "if-ignored", label: "Ignored", value: "Cairo spreads" },
    ]);
  });

  it("counts the spread down as the days pass", () => {
    const spread = (day: number): string | undefined =>
      TUNNEL_SABOTAGE_PRESENTATION.briefingRows(SABOTAGE, ctxOn(day)).find(
        (row) => row.field === "spread",
      )?.value;
    expect(spread(5)).toBe("Tomorrow");
    expect(spread(6)).toBe("Today");
  });

  it("briefs only the task and the fuse for an offer that lost its record", () => {
    const { tunnelSabotage: _dropped, ...bare } = SABOTAGE;
    expect(
      TUNNEL_SABOTAGE_PRESENTATION.briefingRows(bare, ctxOn(4)).map(
        (row) => row.field,
      ),
    ).toEqual(["tunnels", "fuse"]);
  });

  it("says how many mouths were sealed and whether the spread is held", () => {
    const tagline = (r: MissionResult): string | undefined =>
      TUNNEL_SABOTAGE_PRESENTATION.debriefTagline?.(r, ctxOn(5));
    expect(tagline(result("won", 3))).toBe(
      "Every tunnel mouth under Cairo is sealed. Cairo cannot spread for 10 days.",
    );
    expect(tagline(result("lost", 3))).toBe(
      "The tunnel mouths under Cairo are sealed, but the force did not make it home. Cairo spreads when it is due.",
    );
    expect(tagline(result("extracted", 2))).toBe(
      "2 of 3 tunnel mouths sealed. Cairo spreads when it is due.",
    );
    expect(tagline(result("lost", 0))).toBe(
      "The tunnel mouths under Cairo are still open. Cairo spreads when it is due.",
    );
    const { tunnelsTotal: _none, ...other } = result("won", 3);
    expect(tagline(other)).toBeUndefined();
  });
});

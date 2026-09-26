import { describe, expect, it } from "vitest";

import type { TacticalState } from "../../../tactical/model/tactical-state";
import { SITREP_PRESENTATION } from "../../data/sitrep-presentation";
import type { SitrepPresentationCatalogue } from "../../model/sitrep-presentation";
import { sitrepCountdowns } from "./sitrep-countdowns";

// ===========================================
// Fixtures
// ===========================================

/** Just what the query reads: the sitreps, the ship's turn, the turn, the outcome. */
function missionOn(
  turn: number,
  extra: Partial<TacticalState> = {},
): TacticalState {
  return {
    turn,
    sitreps: ["nightfall", "dust-off-window"],
    dustOffTurn: 16,
    ...extra,
  } as TacticalState;
}

// ===========================================
// Tests
// ===========================================

describe("sitrepCountdowns (campaign arc §11)", () => {
  it("counts Dust-off Window's ship down by name, and nothing for a sitrep without a deadline", () => {
    expect(sitrepCountdowns(missionOn(14))).toEqual([
      {
        sitrepId: "dust-off-window",
        name: "Dust-off Window",
        text: "Drop ship leaves in 3 turns",
        turnsLeft: 3,
        urgent: false,
      },
    ]);
  });

  it("turns urgent in the last two turns and says so on the last", () => {
    expect(sitrepCountdowns(missionOn(15))[0]).toMatchObject({
      turnsLeft: 2,
      urgent: true,
    });
    expect(sitrepCountdowns(missionOn(16))[0]).toMatchObject({
      text: "Drop ship leaves at the end of this turn",
      urgent: true,
    });
  });

  it("shows nothing past the window, once the mission is over, or without the sitrep or its turn", () => {
    expect(sitrepCountdowns(missionOn(17))).toEqual([]);
    expect(sitrepCountdowns(missionOn(14, { outcome: "extracted" }))).toEqual(
      [],
    );
    expect(sitrepCountdowns(missionOn(14, { sitreps: ["nightfall"] }))).toEqual(
      [],
    );
    expect(sitrepCountdowns(missionOn(14, { dustOffTurn: undefined }))).toEqual(
      [],
    );
  });

  it("reads the words and the turn from the injected table, in SITREP_IDS order", () => {
    const table: SitrepPresentationCatalogue = {
      ...SITREP_PRESENTATION,
      nightfall: {
        ...SITREP_PRESENTATION.nightfall,
        deadline: { phrase: "Dawn breaks", turn: () => 20 },
      },
    };
    expect(
      sitrepCountdowns(
        missionOn(14, { sitreps: ["dust-off-window", "nightfall"] }),
        table,
      ).map((countdown) => countdown.text),
    ).toEqual(["Dawn breaks in 7 turns", "Drop ship leaves in 3 turns"]);
  });
});

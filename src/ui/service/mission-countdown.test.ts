import { describe, expect, it } from "vitest";

import {
  compareByExpiry,
  missionCountdownText,
  missionCountdownTitle,
  NO_COUNTDOWN_TEXT,
} from "./mission-countdown";

describe("missionCountdownText", () => {
  it("counts the days left on an offer that lapses", () => {
    expect(missionCountdownText({ expiresDay: 9 }, 6)).toBe("3 d");
    expect(missionCountdownText({ expiresDay: 9, pinned: false }, 8)).toBe(
      "1 d",
    );
  });

  it("shows a dash, with a reason, for a pinned offer (ADR 0013 §2.2)", () => {
    const pinned = { expiresDay: 2, pinned: true };
    expect(missionCountdownText(pinned, 30)).toBe(NO_COUNTDOWN_TEXT);
    expect(missionCountdownTitle(pinned)).not.toBe("");
    expect(missionCountdownTitle({ expiresDay: 2 })).toBe("");
  });
});

describe("compareByExpiry", () => {
  it("puts the soonest lapse first and pinned offers last", () => {
    const offers = [
      { id: "pinned", expiresDay: 1, pinned: true },
      { id: "late", expiresDay: 9 },
      { id: "soon", expiresDay: 3 },
    ];
    expect([...offers].sort(compareByExpiry).map((o) => o.id)).toEqual([
      "soon",
      "late",
      "pinned",
    ]);
    expect(
      compareByExpiry(
        { expiresDay: 1, pinned: true },
        { expiresDay: 7, pinned: true },
      ),
    ).toBe(0);
  });
});

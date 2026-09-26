import { describe, expect, it } from "vitest";

import type {
  GameOutcome,
  GameOutcomeSummary,
} from "../../overworld/model/game-outcome";
import { outcomeCopy, outcomeVariant, VICTORY_ART } from "./outcome-copy";

// ===========================================
// Fixtures
// ===========================================

const SUMMARY: GameOutcomeSummary = {
  citiesLost: 4,
  citiesInfested: 20,
  citiesTotal: 51,
  missionsRun: 50,
  daysSurvived: 67,
  finalThreat: 52,
};

/** An outcome of `kind`, with `cause` and the platform attempts when given. */
const outcome = (
  kind: GameOutcome["kind"],
  options: { cause?: GameOutcome["cause"]; attempts?: number } = {},
): GameOutcome => ({
  kind,
  ...(options.cause === undefined ? {} : { cause: options.cause }),
  day: 67,
  summary: {
    ...SUMMARY,
    ...(options.attempts === undefined
      ? {}
      : { platformAttempts: options.attempts }),
  },
});

// ===========================================
// Victories
// ===========================================

describe("outcomeCopy: victories", () => {
  it("burns the platform in orbit on a first-attempt win, over the key art", () => {
    const copy = outcomeCopy(
      outcome("victory", { cause: "story", attempts: 1 }),
    );
    expect(copy).toMatchObject({
      variant: "platform",
      title: "Victory",
      tagline: "The platform burns in orbit. Earth holds.",
      tone: "ok",
      art: VICTORY_ART,
    });
  });

  it("says the last chance held when Last Hope was needed", () => {
    const copy = outcomeCopy(
      outcome("victory", { cause: "story", attempts: 2 }),
    );
    expect(copy).toMatchObject({
      variant: "last-hope",
      title: "Victory",
      tagline: "The last chance held. Earth holds.",
      tone: "ok",
      art: VICTORY_ART,
    });
  });

  it("keeps the plain line, without the platform's art, when no platform was fought", () => {
    // An old victory, or a spine that ends before the finale.
    for (const attempts of [undefined, 0]) {
      const copy = outcomeCopy(outcome("victory", { attempts }));
      expect(copy).toMatchObject({
        variant: "story-victory",
        tagline: "The last story mission is won. Earth holds.",
      });
      expect(copy).not.toHaveProperty("art");
    }
  });

  it("tells a finale victory frozen before the attempts were counted as the platform's", () => {
    expect(outcomeVariant(outcome("victory"), "finale")).toBe("platform");
    expect(outcomeVariant(outcome("victory"), "act-3")).toBe("story-victory");
    // A counted Last Hope stays Last Hope in the finale.
    expect(outcomeVariant(outcome("victory", { attempts: 2 }), "finale")).toBe(
      "last-hope",
    );
  });

  it("still reads the retired victory stub", () => {
    expect(outcomeVariant(outcome("victory-stub"))).toBe("legacy-victory");
    expect(outcomeCopy(outcome("victory-stub")).tagline).toContain(
      "old victory rule",
    );
  });
});

// ===========================================
// Defeats
// ===========================================

describe("outcomeCopy: defeats", () => {
  it("names the threat limit for a threat defeat, and for an old defeat with no cause", () => {
    for (const cause of ["threat", undefined] as const) {
      const copy = outcomeCopy(outcome("defeat", { cause }));
      expect(copy).toMatchObject({
        variant: "threat-defeat",
        title: "Threat limit reached",
        tagline: "Global threat reached 100, ending the campaign.",
        tone: "danger",
      });
      expect(copy).not.toHaveProperty("art");
    }
  });

  it("words a story defeat as the platform holding against the second assault", () => {
    const copy = outcomeCopy(
      outcome("defeat", { cause: "story", attempts: 2 }),
    );
    expect(copy).toMatchObject({
      variant: "story-defeat",
      title: "Assault failed",
      tone: "danger",
    });
    expect(copy).not.toHaveProperty("art");
    expect(copy.tagline).toBe(
      "The Spore Platform assault failed a second time. There is no third: the Earth is lost.",
    );
  });
});

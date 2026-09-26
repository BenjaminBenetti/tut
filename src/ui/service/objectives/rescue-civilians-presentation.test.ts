import { describe, expect, it } from "vitest";

import type { RescueProgress } from "../../../tactical/service/objectives/rescue-civilians-objective";
import { NO_BREAK_SPACE } from "../format";
import { rescueProgressText } from "./rescue-civilians-presentation";

// ===========================================
// Fixtures
// ===========================================

/** A rescue still open: one aboard of four, two needed, one trapped, one lost. */
function progress(overrides: Partial<RescueProgress> = {}): RescueProgress {
  return {
    rescued: 1,
    trapped: 1,
    freed: 1,
    lost: 1,
    total: 4,
    needed: 2,
    status: "open",
    ...overrides,
  };
}

/** The pieces a wrapping line may break the text into: at ordinary spaces only. */
function breakable(text: string): string[] {
  return text.split(" ");
}

/** The text as the player reads it, no-break spaces shown as spaces. */
function read(text: string): string {
  return text.replaceAll(NO_BREAK_SPACE, " ");
}

// ===========================================
// Tests
// ===========================================

describe("rescueProgressText (arc §6.4)", () => {
  it("reads every count with its noun, and only the counts there are", () => {
    expect(read(rescueProgressText(progress()))).toBe(
      "1 / 4 aboard · need 2 · 1 trapped · 1 lost",
    );
    expect(
      read(
        rescueProgressText(
          progress({ rescued: 2, trapped: 0, lost: 0, status: "complete" }),
        ),
      ),
    ).toBe("2 / 4 aboard");
  });

  it("breaks only after a separator, never inside a count and its noun (#1179)", () => {
    expect(breakable(rescueProgressText(progress()))).toEqual([
      `1${NO_BREAK_SPACE}/${NO_BREAK_SPACE}4${NO_BREAK_SPACE}aboard${NO_BREAK_SPACE}·`,
      `need${NO_BREAK_SPACE}2${NO_BREAK_SPACE}·`,
      `1${NO_BREAK_SPACE}trapped${NO_BREAK_SPACE}·`,
      `1${NO_BREAK_SPACE}lost`,
    ]);
  });
});

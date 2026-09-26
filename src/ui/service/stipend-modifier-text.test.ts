import { describe, expect, it } from "vitest";

import {
  EVACUATION_LOST_SOURCE,
  EVACUATION_SAVED_SOURCE,
} from "../../overworld/service/missions/evacuation-consequence";
import {
  stipendModifierSummary,
  stipendPercentText,
} from "./stipend-modifier-text";

describe("stipendPercentText", () => {
  it("signs the change with a true minus sign and rounds it whole", () => {
    expect(stipendPercentText(1.5)).toBe("+50%");
    expect(stipendPercentText(0.9)).toBe("−10%");
    expect(stipendPercentText(1.35)).toBe("+35%");
    expect(stipendPercentText(1)).toBe("+0%");
    expect(stipendPercentText(0.5)).toBe("−50%");
  });
});

describe("stipendModifierSummary", () => {
  it("is absent with no modifiers, so the badge hides", () => {
    expect(stipendModifierSummary(undefined)).toBeUndefined();
    expect(stipendModifierSummary([])).toBeUndefined();
  });

  it("reads one evacuation's bonus as its percentage and its days left", () => {
    expect(
      stipendModifierSummary([
        { factor: 1.5, daysLeft: 10, source: EVACUATION_SAVED_SOURCE },
      ]),
    ).toEqual({
      text: "+50% · 10 d",
      percent: "+50%",
      days: " · 10 d",
      title: "Stipend +50% for 10 more days: a city evacuated",
      tone: "ok",
    });
  });

  it("nets overlapping windows and counts to the first one's end", () => {
    expect(
      stipendModifierSummary([
        { factor: 1.5, daysLeft: 6, source: EVACUATION_SAVED_SOURCE },
        { factor: 0.9, daysLeft: 10, source: EVACUATION_LOST_SOURCE },
        { factor: 0.5, daysLeft: 1 },
      ]),
    ).toEqual({
      text: "−32% · 1 d",
      percent: "−32%",
      days: " · 1 d",
      title: [
        "Stipend +50% for 6 more days: a city evacuated",
        "Stipend −10% for 10 more days: a city abandoned",
        "Stipend −50% for 1 more day: an event",
      ].join("\n"),
      tone: "warn",
    });
  });

  it("shows a cut in amber", () => {
    expect(
      stipendModifierSummary([
        { factor: 0.9, daysLeft: 3, source: EVACUATION_LOST_SOURCE },
      ]),
    ).toMatchObject({ text: "−10% · 3 d", tone: "warn" });
  });
});

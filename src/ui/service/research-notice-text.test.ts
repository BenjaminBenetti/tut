import { describe, expect, it } from "vitest";

import { researchRevealedNotice } from "./research-notice-text";

describe("researchRevealedNotice (campaign arc §8)", () => {
  it("names one new node and says where to find it", () => {
    expect(researchRevealedNotice([{ name: "Spitter Autopsy" }])).toBe(
      "New research: Spitter Autopsy. Open the tech tree to study it.",
    );
  });

  it("names several in the order given", () => {
    expect(
      researchRevealedNotice([
        { name: "Spitter Autopsy" },
        { name: "Hive Guard Autopsy" },
      ]),
    ).toBe(
      "New research: Spitter Autopsy, Hive Guard Autopsy. Open the tech tree to study them.",
    );
  });
});

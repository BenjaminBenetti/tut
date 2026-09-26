import { describe, expect, it } from "vitest";

import { STORY_MISSION_IDS } from "./story-mission-id";

describe("STORY_MISSION_IDS", () => {
  it("lists each id once", () => {
    expect(new Set(STORY_MISSION_IDS).size).toBe(STORY_MISSION_IDS.length);
  });
});

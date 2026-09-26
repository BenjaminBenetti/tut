import { describe, expect, it } from "vitest";

import { DAMAGE_TAGS } from "./damage-tag";

describe("DAMAGE_TAGS", () => {
  it("lists each tag once, as a kebab-case word", () => {
    expect(new Set(DAMAGE_TAGS).size).toBe(DAMAGE_TAGS.length);
    for (const tag of DAMAGE_TAGS) {
      expect(tag).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

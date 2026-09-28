import { describe, expect, it } from "vitest";

import { GENERATOR_TUNING } from "./generator-tuning";

describe("GENERATOR_TUNING (#1175, #1179)", () => {
  it("stands sixty hit points at armour one against the defence's surged waves", () => {
    expect(GENERATOR_TUNING.maxHp).toBe(60);
    expect(GENERATOR_TUNING.armor).toBe(1);
  });
});

import { describe, expect, it } from "vitest";

import { GAME_OUTCOME_KINDS, isGameOutcomeKind } from "./game-outcome";

describe("GameOutcomeKind", () => {
  it("lists each kind once", () => {
    expect(new Set(GAME_OUTCOME_KINDS).size).toBe(GAME_OUTCOME_KINDS.length);
  });

  it("narrows known kinds and rejects unknown strings", () => {
    for (const kind of GAME_OUTCOME_KINDS) {
      expect(isGameOutcomeKind(kind)).toBe(true);
    }
    expect(isGameOutcomeKind("victory")).toBe(true);
    expect(isGameOutcomeKind("won")).toBe(false);
    expect(isGameOutcomeKind("")).toBe(false);
  });

  it("keeps the retired victory stub so old saves still narrow", () => {
    expect(isGameOutcomeKind("victory-stub")).toBe(true);
  });
});

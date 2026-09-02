import { describe, expect, it } from "vitest";

import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import { createNewGameState } from "./game-state-factory";

describe("createNewGameState", () => {
  it("is deterministic for a seed and JSON-serializable", () => {
    const a = createNewGameState({ seed: 42, createdAt: "t" });
    const b = createNewGameState({ seed: 42, createdAt: "t" });
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.meta.seed).toBe(42);
    expect(a.meta.rng.seed).toBe(42);
    expect(GAME_STATE_SCHEMA_VERSION).toBe(1);
  });
});

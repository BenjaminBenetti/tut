import { describe, expect, it } from "vitest";

import type { GameMeta } from "../model/game-state";
import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import { createNewGameMeta } from "./game-state-factory";

describe("createNewGameMeta", () => {
  it("is deterministic for a seed and JSON-serializable", () => {
    const a = createNewGameMeta({ seed: 42, createdAt: "t" });
    const b = createNewGameMeta({ seed: 42, createdAt: "t" });
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a)) as GameMeta).toEqual(a);
    expect(a.seed).toBe(42);
    expect(a.rng.seed).toBe(42);
    expect(a.ids).toEqual({ counters: {} });
    expect(a.createdAt).toBe("t");
    expect(GAME_STATE_SCHEMA_VERSION).toBe(7);
  });

  it("normalises the seed to an unsigned 32-bit integer", () => {
    const meta = createNewGameMeta({ seed: -1, createdAt: "t" });
    expect(meta.seed).toBe(4294967295);
    expect(meta.rng.seed).toBe(4294967295);
  });
});

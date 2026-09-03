import { describe, expect, it } from "vitest";

import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import { MigrationRunner } from "../service/migration-runner";
import { GAME_STATE_MIGRATIONS } from "./migrations";

describe("GAME_STATE_MIGRATIONS", () => {
  it("forms an unbroken chain ending at the current schema version", () => {
    expect(
      () =>
        new MigrationRunner(GAME_STATE_MIGRATIONS, GAME_STATE_SCHEMA_VERSION),
    ).not.toThrow();
    const last = GAME_STATE_MIGRATIONS.at(-1);
    expect(last?.to).toBe(GAME_STATE_SCHEMA_VERSION);
  });

  it("v1 → v2 adds empty spread cooldowns and keeps everything else", () => {
    const step = GAME_STATE_MIGRATIONS[0];
    expect(step?.from).toBe(1);
    const v1 = {
      meta: { seed: 7 },
      overworld: { day: 3, map: {} },
      roster: {},
    };
    const before = JSON.parse(JSON.stringify(v1)) as unknown;
    expect(step?.apply(v1)).toEqual({
      meta: { seed: 7 },
      overworld: { day: 3, map: {}, spreadCooldowns: {} },
      roster: {},
    });
    expect(v1).toEqual(before);
  });

  it("v1 → v2 rejects a state without an overworld slice", () => {
    expect(() => GAME_STATE_MIGRATIONS[0]?.apply({ meta: {} })).toThrow(
      /overworld/,
    );
  });
});

import { describe, expect, it } from "vitest";
import type { JevControl } from "../../tactical/model/jev-control";
import { GAME_STATE_MIGRATIONS } from "../data/migrations";
import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import { MigrationRunner } from "./migration-runner";

describe("Jev save migration after installation defence", () => {
  it.each([
    undefined,
    {
      entities: {
        alpha: { enabled: true, entityPrompt: "Guard the generators" },
      },
      commanders: { tdf: "Hold position", bugs: "" },
      activation: { phase: "bugs", turn: 3, finished: [], externalBugs: true },
    } satisfies JevControl,
  ])("preserves defence state and existing optional Jev data", (jev) => {
    const state = {
      activeMission: {
        phase: "bugs",
        turn: 3,
        units: [{ id: "generator-1", kind: "generator", hp: 19, ap: 0 }],
        objectives: [
          {
            id: "defence",
            kind: "defend-generators",
            targetIds: ["generator-1"],
            complete: false,
            failed: false,
          },
        ],
        edgeSpawn: { wave: 2, totalWaves: 3, nextTurn: 5 },
        ...(jev === undefined ? {} : { jev }),
      },
    };
    const runner = new MigrationRunner(
      GAME_STATE_MIGRATIONS,
      GAME_STATE_SCHEMA_VERSION,
    );
    const result = runner.migrate({
      schemaVersion: 27,
      savedAt: "saved",
      state,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.schemaVersion).toBe(28);
    expect(result.value.state).toEqual(state);
    if (jev === undefined)
      expect(result.value.state).not.toHaveProperty("activeMission.jev");
  });
});

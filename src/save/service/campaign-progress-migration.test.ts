/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { GAME_STATE_MIGRATIONS } from "../data/migrations";
import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import { ADD_CAMPAIGN_PROGRESS } from "./campaign-progress-migration";
import { isGameStateShape } from "./game-state-guard";
import { MigrationRunner } from "./migration-runner";

/** The frozen v1 autosave the end-to-end suite also loads. */
const V1_ENVELOPE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../e2e/fixtures/autosave-v1.json", import.meta.url),
    ),
    "utf8",
  ),
) as { schemaVersion: number; savedAt: string; state: unknown };

/**
 * A v28 campaign whose ledger paid three distinct missions: mission-1
 * twice (a win and a later correction), mission-2 and mission-4 once.
 * Mission-3 only ever bought something, which is not a reward.
 */
function v28() {
  return {
    meta: { seed: 1 },
    roster: { squads: [] },
    tech: { unlocked: [] },
    economy: {
      credits: 900,
      techPoints: 12,
      ledger: [
        { id: "txn-1", day: 1, amount: 300, kind: "stipend", ref: "day-1" },
        { id: "txn-2", day: 2, amount: 900, kind: "reward", ref: "mission-1" },
        { id: "txn-3", day: 2, amount: 50, kind: "reward", ref: "mission-1" },
        {
          id: "txn-4",
          day: 3,
          amount: -200,
          kind: "purchase",
          ref: "mission-3",
        },
        { id: "txn-5", day: 4, amount: 250, kind: "reward", ref: "mission-2" },
        { id: "txn-6", day: 6, amount: 400, kind: "reward", ref: "mission-4" },
      ],
    },
    overworld: {
      day: 7,
      missions: [{ id: "mission-5", typeId: "infestation-clearance" }],
      hives: [],
    },
  };
}

/** The progress `v28()` migrates to. */
const SEEDED = {
  act: "act-1",
  actStartedAt: 0,
  missionsPlayed: 3,
  missionsWon: 0,
  flags: [],
  speciesKilled: [],
  nemeses: [],
};

describe("ADD_CAMPAIGN_PROGRESS (v28 → v29)", () => {
  it("starts an older campaign in Act I with its rewarded missions counted", () => {
    const before = v28();
    const serialized = JSON.stringify(before);
    const next = ADD_CAMPAIGN_PROGRESS.apply(before) as ReturnType<
      typeof v28
    > & { overworld: { progress: unknown } };
    expect(next.overworld.progress).toEqual(SEEDED);
    expect(next.overworld.missions).toBe(before.overworld.missions);
    expect(next.overworld.day).toBe(7);
    expect(next.economy).toBe(before.economy);
    expect(next.roster).toBe(before.roster);
    expect(next.tech).toBe(before.tech);
    expect(JSON.stringify(before)).toBe(serialized);
  });

  it("is idempotent and leaves a campaign that already has progress alone", () => {
    const once = ADD_CAMPAIGN_PROGRESS.apply(v28());
    expect(ADD_CAMPAIGN_PROGRESS.apply(once)).toBe(once);

    const later = {
      ...v28(),
      overworld: {
        ...v28().overworld,
        progress: { ...SEEDED, act: "act-2", missionsPlayed: 20 },
      },
    };
    expect(ADD_CAMPAIGN_PROGRESS.apply(later)).toBe(later);
  });

  it("gives each migrated campaign its own lists", () => {
    const a = ADD_CAMPAIGN_PROGRESS.apply(v28()) as ReturnType<typeof v28> & {
      overworld: { progress: { flags: unknown } };
    };
    const b = ADD_CAMPAIGN_PROGRESS.apply(v28()) as typeof a;
    expect(a.overworld.progress.flags).not.toBe(b.overworld.progress.flags);
  });

  it("counts no missions when the economy or its ledger is missing", () => {
    const { economy: _dropped, ...noEconomy } = v28();
    const noLedger = { ...v28(), economy: { credits: 5 } };
    for (const before of [noEconomy, noLedger]) {
      const next = ADD_CAMPAIGN_PROGRESS.apply(before) as {
        overworld: { progress: { missionsPlayed: number } };
      };
      expect(next.overworld.progress.missionsPlayed).toBe(0);
    }
  });

  it("rejects a state with no overworld slice", () => {
    expect(() => ADD_CAMPAIGN_PROGRESS.apply({ meta: {} })).toThrow(
      /overworld/,
    );
    expect(() => ADD_CAMPAIGN_PROGRESS.apply("save")).toThrow(/overworld/);
  });

  it("is registered and migrates a v28 save to the current schema", () => {
    const runner = new MigrationRunner(
      GAME_STATE_MIGRATIONS,
      GAME_STATE_SCHEMA_VERSION,
    );
    const result = runner.migrate({
      schemaVersion: 28,
      savedAt: "saved",
      state: v28(),
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
    expect(GAME_STATE_MIGRATIONS).toContain(ADD_CAMPAIGN_PROGRESS);
    const state = result.value.state as { overworld: { progress: unknown } };
    expect(state.overworld.progress).toEqual(SEEDED);
  });

  it("carries the frozen v1 autosave through the whole chain to a loadable state", () => {
    const runner = new MigrationRunner(
      GAME_STATE_MIGRATIONS,
      GAME_STATE_SCHEMA_VERSION,
    );
    const result = runner.migrate(V1_ENVELOPE);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
    const state = result.value.state as { overworld: { progress: unknown } };
    expect(state.overworld.progress).toEqual({ ...SEEDED, missionsPlayed: 0 });
    expect(isGameStateShape(result.value.state)).toBe(true);
  });
});

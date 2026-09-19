import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { GAME_STATE_MIGRATIONS } from "../data/migrations";
import { GAME_STATE_SCHEMA_VERSION } from "../model/game-state";
import { MigrationRunner } from "./migration-runner";
import { ADD_TECH_POINTS } from "./tech-points-migration";

const CLEARANCE = MISSION_TYPES["infestation-clearance"];

function v25() {
  return {
    meta: { seed: 1 },
    roster: { squads: [] },
    economy: { credits: 900, ledger: [] },
    overworld: {
      day: 3,
      missions: [
        {
          id: "mission-1",
          typeId: "infestation-clearance",
          difficulty: 4,
          rewards: { credits: 1200 },
        },
      ],
      lastMissionResult: { missionId: "mission-0", creditsAwarded: 300 },
    },
    activeMission: { units: [], log: [] },
  };
}

describe("ADD_TECH_POINTS", () => {
  it("starts an older campaign with no tech points and nothing unlocked", () => {
    const before = v25();
    const serialized = JSON.stringify(before);
    const next = ADD_TECH_POINTS.apply(before) as ReturnType<typeof v25> & {
      tech: unknown;
    };
    expect(next.economy).toEqual({ credits: 900, ledger: [], techPoints: 0 });
    expect(next.tech).toEqual({ unlocked: [] });
    expect(next.overworld.missions[0]?.rewards).toEqual({
      credits: 1200,
      techPoints:
        CLEARANCE.techRewardBase + CLEARANCE.techRewardPerDifficulty * 4,
    });
    expect(next.overworld.lastMissionResult).toEqual({
      missionId: "mission-0",
      creditsAwarded: 300,
      techPointsAwarded: 0,
    });
    expect(next.activeMission).toEqual({ units: [], log: [], carcasses: [] });
    expect(next.roster).toBe(before.roster);
    expect(JSON.stringify(before)).toBe(serialized);
  });

  it("is idempotent and leaves a campaign that already has the fields alone", () => {
    const once = ADD_TECH_POINTS.apply(v25()) as Record<string, unknown>;
    const twice = ADD_TECH_POINTS.apply(once) as Record<string, unknown>;
    expect(twice).toEqual(once);
    expect(twice.economy).toBe(once.economy);
    expect((twice.overworld as { missions: unknown }).missions).toBe(
      (once.overworld as { missions: unknown }).missions,
    );
  });

  it("copes with no active mission and no last result", () => {
    const { activeMission: _dropped, ...rest } = v25();
    const before = {
      ...rest,
      overworld: { ...rest.overworld, lastMissionResult: undefined },
    };
    const next = ADD_TECH_POINTS.apply(before) as Record<string, unknown>;
    expect(next).not.toHaveProperty("activeMission");
    expect((next.overworld as Record<string, unknown>).lastMissionResult).toBe(
      undefined,
    );
  });

  it("is registered and reaches the current schema", () => {
    const runner = new MigrationRunner(
      GAME_STATE_MIGRATIONS,
      GAME_STATE_SCHEMA_VERSION,
    );
    const result = runner.migrate({
      schemaVersion: 25,
      savedAt: "saved",
      state: v25(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.schemaVersion).toBe(GAME_STATE_SCHEMA_VERSION);
    expect(GAME_STATE_MIGRATIONS).toContain(ADD_TECH_POINTS);
  });
});

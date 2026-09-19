import { isRecord } from "../../core/model/record-guard";
import { MISSION_TYPES } from "../../content/data/mission-types";
import type { MissionType } from "../../content/model/mission-type";
import { createInitialTechState } from "../../tech/service/tech-state-factory";
import type { Migration } from "../model/migration";

// ===========================================
// v25 → v26: tech points and the tech tree
// ===========================================

/**
 * v25 → v26 (#1171): the economy gains `techPoints`, the campaign a
 * `tech` slice, every mission offer a `rewards.techPoints`, the last
 * mission result a `techPointsAwarded`, and a mission in flight its
 * `carcasses`. An older campaign has earned nothing and unlocked nothing,
 * so every counter starts at zero and every list empty; an offer made
 * before tech existed pays what its type would pay today, computed from
 * the mission type's tech reward so a migrated save and a fresh one
 * price the same difficulty the same way.
 *
 * ```
 *   economy              ──► has techPoints? ── no ──► techPoints: 0
 *   tech                 ──► present? ───────── no ──► { unlocked: [] }
 *   overworld.missions[] ──► rewards.techPoints? ─ no ─► base + perDifficulty × difficulty
 *   lastMissionResult    ──► techPointsAwarded? ── no ──► 0
 *   activeMission        ──► carcasses? ────────── no ──► []
 * ```
 */
export const ADD_TECH_POINTS: Migration = {
  from: 25,
  to: 26,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.economy)) {
      throw new Error("v25 state has no economy slice");
    }
    if (
      !isRecord(state.overworld) ||
      !Array.isArray(state.overworld.missions)
    ) {
      throw new Error("v25 state has no overworld slice with missions");
    }
    const { overworld } = state;
    const missions = migrateMissions(overworld.missions as unknown[]);
    const lastMissionResult = migrateResult(overworld.lastMissionResult);
    const economy =
      typeof state.economy.techPoints === "number"
        ? state.economy
        : { ...state.economy, techPoints: 0 };
    return {
      ...state,
      economy,
      tech: isRecord(state.tech) ? state.tech : createInitialTechState(),
      overworld: {
        ...overworld,
        missions,
        ...(lastMissionResult === undefined ? {} : { lastMissionResult }),
      },
      ...(isRecord(state.activeMission)
        ? { activeMission: { carcasses: [], ...state.activeMission } }
        : {}),
    };
  },
};

// ===========================================
// Private Functions
// ===========================================

/** Prices every offer that needs it; the same array back when none does. */
function migrateMissions(missions: readonly unknown[]): readonly unknown[] {
  const migrated = missions.map(migrateMission);
  return migrated.every((mission, i) => mission === missions[i])
    ? missions
    : migrated;
}

/**
 * Gives an offer the tech reward its type pays today, if it has none.
 * An offer that carries no priced rewards at all (a fixture, or a shape
 * an older step already passed through untouched) is left as it is.
 */
function migrateMission(mission: unknown): unknown {
  if (
    !isRecord(mission) ||
    !isRecord(mission.rewards) ||
    typeof mission.difficulty !== "number" ||
    typeof mission.typeId !== "string" ||
    typeof mission.rewards.techPoints === "number"
  ) {
    return mission;
  }
  const type: MissionType | undefined =
    MISSION_TYPES[mission.typeId as keyof typeof MISSION_TYPES];
  if (type === undefined) {
    throw new Error(`v25 mission has unknown type "${mission.typeId}"`);
  }
  const techPoints =
    type.techRewardBase + type.techRewardPerDifficulty * mission.difficulty;
  return { ...mission, rewards: { ...mission.rewards, techPoints } };
}

/** Marks the last debrief as having paid no tech points, if it has no say. */
function migrateResult(result: unknown): Record<string, unknown> | undefined {
  if (!isRecord(result)) {
    return undefined;
  }
  return typeof result.techPointsAwarded === "number"
    ? result
    : { ...result, techPointsAwarded: 0 };
}

import { isRecord } from "../../core/model/record-guard";
import type { Migration } from "../model/migration";

// ===========================================
// v28 → v29: campaign progress
// ===========================================

/**
 * v28 → v29 (ADR 0013 §2.1): the overworld gains a required `progress`,
 * the campaign's act, mission counts, story flags, first kills and
 * nemeses. A campaign saved before acts existed is in Act I, which it
 * began before its first mission. It has earned no flags, and nobody
 * recorded its kills or nemeses, so those lists start empty. It has
 * `missionsWon` 0, because no save recorded outcomes. Its
 * `missionsPlayed` is the count the game-over summary has always shown:
 * distinct mission refs among the economy ledger's `reward` entries. A
 * loss pays nothing and so is not counted, but that is the best the
 * save can say.
 *
 * ```
 *   overworld.progress ──► present? ── yes ──► state unchanged (identity)
 *                                    └─ no ──► { act: "act-1", actStartedAt: 0,
 *                                                missionsPlayed: |distinct reward refs|,
 *                                                missionsWon: 0, flags: [],
 *                                                speciesKilled: [], nemeses: [] }
 * ```
 *
 * The seed is a literal frozen at v29 and the count is copied from
 * `outcome-service.ts` rather than imported, so later changes to the
 * live factory or the summary never change what an old save migrates
 * to (as the v9 → v10 step explains).
 */
export const ADD_CAMPAIGN_PROGRESS: Migration = {
  from: 28,
  to: 29,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v28 state has no overworld slice");
    }
    const { overworld } = state;
    if (isRecord(overworld.progress)) {
      return state;
    }
    return {
      ...state,
      overworld: {
        ...overworld,
        progress: seedProgress(rewardedMissions(state.economy)),
      },
    };
  },
};

// ===========================================
// Private Functions
// ===========================================

/** The v29 progress of a campaign that has played `missionsPlayed` missions. */
function seedProgress(missionsPlayed: number): Record<string, unknown> {
  return {
    act: "act-1",
    actStartedAt: 0,
    missionsPlayed,
    missionsWon: 0,
    flags: [],
    speciesKilled: [],
    nemeses: [],
  };
}

/**
 * Missions the ledger shows were paid for: distinct `ref`s of `reward`
 * entries, one per resolved mission that paid credits. An economy or
 * ledger that is missing or malformed counts as none.
 */
function rewardedMissions(economy: unknown): number {
  if (!isRecord(economy) || !Array.isArray(economy.ledger)) {
    return 0;
  }
  const missions = new Set<unknown>();
  for (const entry of economy.ledger as readonly unknown[]) {
    if (isRecord(entry) && entry.kind === "reward") {
      missions.add(entry.ref);
    }
  }
  return missions.size;
}

import type { MissionTypeCatalogue } from "../../overworld/model/mission-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import type { TacticalState } from "../../tactical/model/tactical-state";
import { formatWhole } from "./format";

// ===========================================
// Types
// ===========================================

/** Where one stage of a linked mission stands. */
export type StageTrackState = "cleared" | "current" | "ahead";

/** One stage of a linked mission, as the objective tracker lists it. */
export interface StageTrackRow {
  /** Zero-based stage index. */
  readonly index: number;
  /** The stage's name: "The hull". */
  readonly name: string;
  readonly state: StageTrackState;
}

/** A linked mission's stages for the objective tracker (#1179). */
export interface StageTrack {
  /** Every stage, in play order. */
  readonly rows: readonly StageTrackRow[];
  /**
   * What the tracker's summary names once this stage's objectives are
   * done, in place of boarding the drop ship: "on to the core". Absent
   * on the last stage, which ends as a one-map mission does.
   */
  readonly closingStep?: string;
}

// ===========================================
// Queries
// ===========================================

/**
 * Every stage's name for a linked mission, in play order: the type's
 * (`MissionType.stages`), read through the offer, which stays on the
 * board until the mission is finished. "Stage n" for a stage the type
 * does not name, or when the types or the offer are not to hand.
 * Empty for a one-map mission.
 *
 * @param mission - The active mission.
 * @param campaign - The campaign it belongs to, for its offer.
 * @param missionTypes - The types; absent, every stage is numbered.
 */
export function stageNamesOf(
  mission: TacticalState,
  campaign: GameState | undefined,
  missionTypes?: MissionTypeCatalogue,
): readonly string[] {
  const count = mission.stage?.count ?? 0;
  const typeId = campaign?.overworld.missions.find(
    (offer) => offer.id === mission.missionId,
  )?.typeId;
  const specs =
    typeId === undefined ? undefined : missionTypes?.[typeId].stages;
  return Array.from(
    { length: count },
    (_, index) => specs?.[index]?.name ?? `Stage ${formatWhole(index + 1)}`,
  );
}

/**
 * The objective tracker's stage rows for `mission` (ADR 0013
 * amendment, #1179), or undefined for a one-map mission, which has no
 * stages to list.
 *
 * ```
 *   STAGES
 *   ✓ The hull        cleared   (an earlier stage, or this one won)
 *   ▸ The core        current
 *   summary once done: "1 / 1 — on to the core"   (not the last stage)
 * ```
 *
 * @param mission - The active mission, if any.
 * @param campaign - The campaign it belongs to.
 * @param missionTypes - The types, for the stages' names.
 */
export function stageTrackOf(
  mission: TacticalState | undefined,
  campaign: GameState | undefined,
  missionTypes?: MissionTypeCatalogue,
): StageTrack | undefined {
  const stage = mission?.stage;
  if (mission === undefined || stage === undefined) {
    return undefined;
  }
  const names = stageNamesOf(mission, campaign, missionTypes);
  // A stage won is cleared from the moment it is won, not from the
  // Continue that leaves it: the transition over it says so too.
  const won = mission.outcome === "won";
  const rows = names.map((name, index): StageTrackRow => ({
    index,
    name,
    state:
      index < stage.index || (index === stage.index && won)
        ? "cleared"
        : index === stage.index
          ? "current"
          : "ahead",
  }));
  const next = names[stage.index + 1];
  return next === undefined
    ? { rows }
    : { rows, closingStep: `on to ${lowerFirst(next)}` };
}

// ===========================================
// Helpers
// ===========================================

/** "The core" as a sentence continues it: "the core". */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

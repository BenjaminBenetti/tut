import { HIVE_TUNING } from "../../../overworld/data/hive-tuning";
import { MISSION_TUNING } from "../../../overworld/data/mission-tuning";
import { daysToNextHiveLevel } from "../../../overworld/model/hive";
import type { HiveTuning } from "../../../overworld/model/hive-tuning";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import type { HiveAssaultTuning } from "../../../overworld/model/mission-tuning";
import type { RegionId } from "../../../overworld/model/region";
import {
  findCity,
  findRegion,
} from "../../../overworld/service/earth-map-query-service";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentation,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import { formatWhole } from "../format";

// ===========================================
// Types
// ===========================================

/** The numbers the Hive Assault's words quote, as the overworld tunes them. */
export interface HiveAssaultPresentationTuning {
  /** Step length, liberation cut and pause: `HIVE_TUNING` in the shipped game. */
  readonly hive: Pick<
    HiveTuning,
    "difficultyStepDays" | "liberationCut" | "liberationGrowthPauseDays"
  >;
  /** The tech multiplier: `MISSION_TUNING.hiveAssault` in the shipped game. */
  readonly assault: HiveAssaultTuning;
}

// ===========================================
// Briefing fields
// ===========================================

/** The hive's level and how fast it climbs. */
const HIVE_LEVEL: BriefingField = { field: "hive-level", label: "Hive level" };

/** The region a win frees, and what freeing it does. */
const LIBERATES: BriefingField = { field: "liberates", label: "Liberates" };

/**
 * The assault's tech multiplier over an ordinary mission's award. The
 * tech reward row above already carries it; this row says why it is big.
 */
const TECH_MULTIPLIER: BriefingField = {
  field: "tech-multiplier",
  label: "Tech multiplier",
};

// ===========================================
// Presentation
// ===========================================

/**
 * Builds the Hive Assault's presentation (campaign arc §6.5, #1179) over
 * the tuning whose numbers its words quote: the hive glyph, the hive's
 * level, the region a win liberates and the tech multiplier in the
 * briefing, the level and the next growth on the offer's row, and a
 * debrief that says whether the hive fell.
 *
 * ```
 *   Hive level       2 (+1 every 7 days)
 *   Liberates        Middle East: cities −20, growth paused 10 days
 *   Tech multiplier  ×2, in the reward
 *
 *   offer row        Hive level 2 · grows in 3 d
 * ```
 *
 * @param tuning - The hive and assault tuning the rows quote.
 */
export function createHiveAssaultPresentation(
  tuning: HiveAssaultPresentationTuning,
): MissionPresentation {
  return {
    typeId: "hive-assault",
    icon: "marker-hive",
    briefingFields: [HIVE_LEVEL, LIBERATES, TECH_MULTIPLIER],
    briefingRows: (mission, ctx) => hiveRows(mission, ctx, tuning),
    offerNote: (mission, ctx) => hiveNote(mission, ctx, tuning),
    debriefTagline: (result, ctx) => hiveTagline(result, ctx, tuning),
  };
}

/** `hive-assault` as the shipped game shows it. */
export const HIVE_ASSAULT_PRESENTATION: MissionPresentation =
  createHiveAssaultPresentation({
    hive: HIVE_TUNING,
    assault: MISSION_TUNING.hiveAssault,
  });

// ===========================================
// Helpers
// ===========================================

/**
 * The three rows. None when the offer carries no hive, which only a
 * hand-built offer can: the briefing then keeps the shared grid.
 */
function hiveRows(
  mission: Mission,
  ctx: MissionPresentationContext,
  tuning: HiveAssaultPresentationTuning,
): readonly BriefingRow[] {
  const hive = mission.hive;
  if (hive === undefined) {
    return [];
  }
  return [
    {
      ...HIVE_LEVEL,
      value: `${formatWhole(hive.level)} (+1 every ${formatWhole(tuning.hive.difficultyStepDays)} days)`,
    },
    {
      ...LIBERATES,
      value: `${regionName(hive.regionId, ctx)}: cities −${formatWhole(tuning.hive.liberationCut)}, growth paused ${formatWhole(tuning.hive.liberationGrowthPauseDays)} days`,
    },
    {
      ...TECH_MULTIPLIER,
      value: `×${String(tuning.assault.techRewardMultiplier)}, in the reward`,
    },
  ];
}

/**
 * "Hive level 2 · grows in 3 d" under the offer's row. The next growth
 * reads the standing hive's formation day; a hive already gone (the
 * offer is withdrawn on the next tick) shows its level alone.
 */
function hiveNote(
  mission: Mission,
  ctx: MissionPresentationContext,
  tuning: HiveAssaultPresentationTuning,
): string | undefined {
  const spec = mission.hive;
  if (spec === undefined) {
    return undefined;
  }
  const level = `Hive level ${formatWhole(spec.level)}`;
  const hive = ctx.state.overworld.hives.find((h) => h.id === spec.hiveId);
  if (hive === undefined) {
    return level;
  }
  const days = daysToNextHiveLevel(hive, ctx.state.overworld.day, tuning.hive);
  return `${level} · grows in ${formatWhole(days)} d`;
}

/**
 * The debrief's line for an assault (a result that reports
 * `hiveCoreDestroyed`); undefined for any other mission.
 *
 * ```
 *   won                   core down, force home  ──► region liberated
 *   lost, core down       nobody reached the ship ──► the hive stands
 *   lost, core standing                           ──► the hive stands, and grows
 *   extracted             core standing, got out  ──► the hive grows on
 * ```
 */
function hiveTagline(
  result: MissionResult,
  ctx: MissionPresentationContext,
  tuning: HiveAssaultPresentationTuning,
): string | undefined {
  if (result.hiveCoreDestroyed === undefined) {
    return undefined;
  }
  if (result.outcome === "won") {
    const city = findCity(ctx.state.overworld.map, result.cityId);
    const region =
      city === undefined ? "The region" : regionName(city.regionId, ctx);
    return `The hive core is destroyed. ${region} is liberated: its cities are cleared by ${formatWhole(tuning.hive.liberationCut)} and the bugs are held back for ${formatWhole(tuning.hive.liberationGrowthPauseDays)} days.`;
  }
  if (result.outcome === "extracted") {
    return "The force pulled out with the hive core still standing. The hive grows on.";
  }
  return result.hiveCoreDestroyed
    ? "The hive core fell, but nobody reached the drop ship. Without a confirmed kill the hive stands."
    : `The assault failed and the hive stands. It grows every ${formatWhole(tuning.hive.difficultyStepDays)} days.`;
}

/** The region's name on the campaign map, or its id if the map has no such region. */
function regionName(
  regionId: RegionId,
  ctx: MissionPresentationContext,
): string {
  return findRegion(ctx.state.overworld.map, regionId)?.name ?? regionId;
}

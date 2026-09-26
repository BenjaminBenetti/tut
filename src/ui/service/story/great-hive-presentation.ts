import { GREAT_HIVE_TUNING } from "../../../overworld/data/great-hive-tuning";
import { HIVE_TUNING } from "../../../overworld/data/hive-tuning";
import type { GreatHive } from "../../../overworld/model/great-hive";
import {
  findGreatHive,
  greatHiveAssaultedBy,
  greatHiveTally,
} from "../../../overworld/model/great-hive";
import type { GreatHiveTuning } from "../../../overworld/model/great-hive-tuning";
import type { HiveTuning } from "../../../overworld/model/hive-tuning";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { STORY_RETRY_DAYS } from "../../../overworld/model/story-mission-rule";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import type { StoryPresentation } from "../../model/story-presentation";
import { formatWhole } from "../format";

// ===========================================
// Types
// ===========================================

/** The numbers the Great Hive's words quote, as the overworld tunes them. */
export interface GreatHivePresentationTuning {
  /** Liberation cut and pause: `HIVE_TUNING` in the shipped game. */
  readonly hive: Pick<
    HiveTuning,
    "liberationCut" | "liberationGrowthPauseDays"
  >;
  /** How many there are and how high a repelled one climbs: `GREAT_HIVE_TUNING`. */
  readonly greatHive: Pick<GreatHiveTuning, "count" | "maxLevel">;
}

// ===========================================
// Briefing fields
// ===========================================

/**
 * The Great Hive's own slots. The keys are its own rather than the
 * shared story `Objective` and `Win`, whose slots the briefing builds
 * first: with its own, the Great Hive's rows stay together and target
 * first.
 */
const TARGET: BriefingField = { field: "great-hive-target", label: "Target" };
const OBJECTIVE: BriefingField = {
  field: "great-hive-objective",
  label: "Objective",
};
const LIBERATES: BriefingField = {
  field: "great-hive-liberates",
  label: "Liberates",
};
const BEACONS: BriefingField = {
  field: "great-hive-beacons",
  label: "Beacons",
};
const WIN: BriefingField = { field: "great-hive-win", label: "Win" };

// ===========================================
// Presentation
// ===========================================

/**
 * A Great Hive assault (campaign arc §6.9, #1179): one of the Spore
 * Platform's three beacons, an oversized Hive Assault. The briefing
 * names the continent and counts the beacons; the debrief says whether
 * this one fell and what is left.
 *
 * ```
 *   Briefing · Great Hive
 *   Uplink traced the platform's beacons to three Great Hives. …
 *   Target      Great Hive: Europe
 *   Objective   Destroy the core; the beacon falls with it
 *   Liberates   Europe, 4 regions: cities −20, growth paused 10 days
 *   Beacons     Great Hives destroyed: 1 / 3
 *   Win         All three: the launch window opens
 * ```
 *
 * @param tuning - The liberation and Great Hive tuning the rows quote.
 */
export function createGreatHivePresentation(
  tuning: GreatHivePresentationTuning,
): StoryPresentation {
  return {
    storyId: "great-hive",
    description:
      "Uplink traced the Spore Platform's beacons to three Great Hives. Each is a hive cavern grown past anything seen: a longer march, more chambers asleep along it, a packed guard and a core that takes several turns to break. Destroy the core and get the force home.",
    briefingFields: [TARGET, OBJECTIVE, LIBERATES, BEACONS, WIN],
    briefingRows: (mission, ctx) => greatHiveRows(mission, ctx, tuning),
    debriefTagline: (result, ctx) => greatHiveTagline(result, ctx, tuning),
  };
}

/** The Great Hive as the shipped game shows it. */
export const GREAT_HIVE_PRESENTATION: StoryPresentation =
  createGreatHivePresentation({
    hive: HIVE_TUNING,
    greatHive: GREAT_HIVE_TUNING,
  });

/**
 * "Great Hive: Europe", with the level once a lost assault has raised
 * it: the offer row's note and the briefing's target.
 *
 * @param hive - The Great Hive assaulted.
 */
export function greatHiveTargetText(hive: GreatHive): string {
  const target = `Great Hive: ${hive.name}`;
  return hive.level > 0
    ? `${target} · level ${formatWhole(hive.level)}`
    : target;
}

// ===========================================
// Helpers
// ===========================================

/** The five rows; none when the offer names no Great Hive the campaign knows. */
function greatHiveRows(
  mission: Mission,
  ctx: MissionPresentationContext,
  tuning: GreatHivePresentationTuning,
): readonly BriefingRow[] {
  const hiveId = mission.hive?.hiveId;
  const hive =
    hiveId === undefined
      ? undefined
      : findGreatHive(ctx.state.overworld, hiveId);
  if (hive === undefined) {
    return [];
  }
  return [
    { ...TARGET, value: greatHiveTargetText(hive) },
    { ...OBJECTIVE, value: "Destroy the core; the beacon falls with it" },
    {
      ...LIBERATES,
      value: `${hive.name}, ${regionCount(hive)}: cities −${formatWhole(tuning.hive.liberationCut)}, growth paused ${formatWhole(tuning.hive.liberationGrowthPauseDays)} days`,
    },
    { ...BEACONS, value: tallyText(ctx, tuning) },
    { ...WIN, value: "All three: the launch window opens" },
  ];
}

/**
 * The debrief's line for a Great Hive assault: the Great Hive whose last
 * assault this result was. Undefined for any other result.
 *
 * ```
 *   won, fewer than all down  ──► beacon dark, continent liberated, N / 3
 *   won, the last             ──► all three dark: the launch window opens
 *   not won                   ──► still standing, level, back in 5 days
 * ```
 */
function greatHiveTagline(
  result: MissionResult,
  ctx: MissionPresentationContext,
  tuning: GreatHivePresentationTuning,
): string | undefined {
  const hive = greatHiveAssaultedBy(ctx.state.overworld, result.missionId);
  if (hive === undefined) {
    return undefined;
  }
  if (result.outcome === "won" && hive.destroyedDay !== undefined) {
    const tally = greatHiveTally(ctx.state.overworld);
    const destroyed = tally?.destroyed ?? 0;
    const total = tally?.total ?? tuning.greatHive.count;
    const freed = `The Great Hive under ${hive.name} is destroyed, and its beacon with it. ${hive.name} is liberated.`;
    return destroyed >= total
      ? `${freed} All three beacons are dark: the launch window opens.`
      : `${freed} Great Hives destroyed: ${formatWhole(destroyed)} / ${formatWhole(total)}.`;
  }
  const stronger =
    hive.level >= tuning.greatHive.maxLevel
      ? `It stands at level ${formatWhole(hive.level)}, as strong as it grows.`
      : `It grows to level ${formatWhole(hive.level)}: a tougher core and one more guard.`;
  return `The Great Hive under ${hive.name} still stands. ${stronger} The assault is pinned again in ${formatWhole(STORY_RETRY_DAYS)} days.`;
}

/** "Great Hives destroyed: 1 / 3" for the campaign of `ctx`. */
function tallyText(
  ctx: MissionPresentationContext,
  tuning: GreatHivePresentationTuning,
): string {
  const tally = greatHiveTally(ctx.state.overworld);
  return `Great Hives destroyed: ${formatWhole(tally?.destroyed ?? 0)} / ${formatWhole(tally?.total ?? tuning.greatHive.count)}`;
}

/** "4 regions", or "1 region". */
function regionCount(hive: GreatHive): string {
  const count = hive.regionIds.length;
  return `${formatWhole(count)} ${count === 1 ? "region" : "regions"}`;
}

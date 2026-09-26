import { MISSION_TUNING } from "../../../overworld/data/mission-tuning";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import type { StipendWindow } from "../../../overworld/model/mission-tuning";
import { findCity } from "../../../overworld/service/earth-map-query-service";
import { evacueesSaved } from "../../../overworld/service/missions/evacuation-consequence";
import { rescueNeeded } from "../../../tactical/service/objectives/rescue-civilians-objective";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentation,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import { formatWhole } from "../format";
import { stipendPercentText } from "../stipend-modifier-text";

// ===========================================
// Briefing fields
// ===========================================

/** How many groups are trapped. */
const CIVILIANS: BriefingField = { field: "civilians", label: "Civilians" };

/** How many must get out for the evacuation to count. */
const TO_WIN: BriefingField = { field: "evacuation-win", label: "Win" };

/** What a saved city pays beyond the reward. */
const SAVED: BriefingField = { field: "evacuation-saved", label: "Saved" };

/** What a lost or lapsed one costs. */
const LOST: BriefingField = {
  field: "evacuation-lost",
  label: "Lost or ignored",
};

// ===========================================
// Presentation
// ===========================================

/**
 * Evacuation (campaign arc §6.4): a civilian walking out in the list;
 * the groups, the win line and what saving or losing the city does to
 * the stipend in the briefing; and a debrief that counts the groups
 * aboard.
 *
 * ```
 *   Civilians         Free 4 civilian groups
 *   Win               At least 2 extracted
 *   Saved             Stipend +50% for 10 days · ¢100 a group
 *   Lost or ignored   Stipend −10% for 10 days
 * ```
 *
 * The win line is the rescue objective's own threshold (`rescueNeeded`)
 * and the stipend numbers the shipped tuning's (`MISSION_TUNING
 * .evacuation`), the same the rules read.
 */
export const EVACUATION_PRESENTATION: MissionPresentation = {
  typeId: "evacuation",
  icon: "evacuate",
  briefingFields: [CIVILIANS, TO_WIN, SAVED, LOST],
  briefingRows: evacuationRows,
  debriefTagline: evacuationTagline,
};

// ===========================================
// Helpers
// ===========================================

/**
 * The groups and the win line when the offer carries its spec (every
 * evacuation the director makes does), and the stipend's stakes always.
 */
function evacuationRows(mission: Mission): readonly BriefingRow[] {
  const tuning = MISSION_TUNING.evacuation;
  const rows: BriefingRow[] = [];
  const spec = mission.evacuation;
  if (spec !== undefined) {
    rows.push(
      {
        ...CIVILIANS,
        value: `Free ${formatWhole(spec.groups)} civilian groups`,
      },
      {
        ...TO_WIN,
        value: `At least ${formatWhole(rescueNeeded(spec.groups))} extracted`,
      },
      {
        ...SAVED,
        value: `${windowText(tuning.savedStipend)} · ¢${formatWhole(spec.creditsPerGroup)} a group`,
      },
    );
  } else {
    rows.push({ ...SAVED, value: windowText(tuning.savedStipend) });
  }
  rows.push({ ...LOST, value: windowText(tuning.lostStipend) });
  return rows;
}

/**
 * An evacuation says how many groups got out instead of the generic
 * line, and what the city's fate does to the stipend. Undefined for a
 * result with no civilians, which is not an evacuation's.
 *
 * ```
 *   every group aboard   ──► "Every civilian group in Cairo is aboard. Stipend +50% …"
 *   saved, not all       ──► "3 of 4 civilian groups are out of Cairo. Stipend +50% …"
 *   some, too few        ──► "Only 1 of 4 civilian groups got out of Cairo. Stipend −10% …"
 *   none                 ──► "No civilian group got out of Cairo. Stipend −10% …"
 * ```
 */
function evacuationTagline(
  result: MissionResult,
  ctx: MissionPresentationContext,
): string | undefined {
  const total = result.civiliansTotal;
  if (total === undefined) {
    return undefined;
  }
  const rescued = result.civiliansRescued ?? 0;
  const tuning = MISSION_TUNING.evacuation;
  const city =
    findCity(ctx.state.overworld.map, result.cityId)?.name ?? result.cityId;
  const of = `${formatWhole(rescued)} of ${formatWhole(total)}`;
  if (evacueesSaved(result)) {
    const out =
      rescued === total
        ? `Every civilian group in ${city} is aboard.`
        : `${of} civilian groups are out of ${city}.`;
    const home =
      result.outcome === "won" ? "" : " The force did not make it home.";
    return `${out}${home} ${windowText(tuning.savedStipend)}.`;
  }
  const out =
    rescued === 0
      ? `No civilian group got out of ${city}.`
      : `Only ${of} civilian groups got out of ${city}.`;
  return `${out} ${windowText(tuning.lostStipend)}.`;
}

/** `Stipend +50% for 10 days`. */
function windowText(window: StipendWindow): string {
  return `Stipend ${stipendPercentText(window.factor)} for ${formatWhole(window.days)} days`;
}

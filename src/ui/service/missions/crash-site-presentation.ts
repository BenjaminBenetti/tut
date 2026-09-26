import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { MISSION_TUNING } from "../../../overworld/data/mission-tuning";
import { findCity } from "../../../overworld/service/earth-map-query-service";
import { SPAWN_TUNING } from "../../../tactical/data/spawn-tuning";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentation,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import { formatWhole } from "../format";

// ===========================================
// Briefing fields
// ===========================================

/** When the pod matures and bursts. */
const POD: BriefingField = { field: "pod", label: "Spore pod" };

/** Where the pod came down, and what the landing does. */
const LANDING: BriefingField = { field: "landing", label: "Fresh landing" };

/** The tech-point premium a crash site pays. */
const TECH_BONUS: BriefingField = { field: "tech-bonus", label: "Tech bonus" };

// ===========================================
// Presentation
// ===========================================

/**
 * Crash site (campaign arc §6.3): the falling-pod glyph in the list; the
 * pod's clock, the landing it made and the tech premium in the briefing;
 * and a debrief that says whether the pod was wrecked or matured.
 *
 * ```
 *   Spore pod       Matures at the end of turn 8
 *   Fresh landing   Cairo · +10 now · erased if the pod falls
 *   Tech bonus      TP ×1.5
 * ```
 *
 * The numbers are the shipped tuning's (`SPAWN_TUNING.podMaturityTurn`,
 * `MISSION_TUNING.crashSite`), the same the rules read.
 */
export const CRASH_SITE_PRESENTATION: MissionPresentation = {
  typeId: "crash-site",
  icon: "pod",
  briefingFields: [POD, LANDING, TECH_BONUS],
  briefingRows: crashSiteRows,
  debriefTagline: crashSiteTagline,
};

// ===========================================
// Helpers
// ===========================================

/**
 * The pod's clock and the tech premium on every crash site, and the
 * landing when the offer records one (every offer made since crash sites
 * exist does).
 */
function crashSiteRows(
  mission: Mission,
  ctx: MissionPresentationContext,
): readonly BriefingRow[] {
  const tuning = MISSION_TUNING.crashSite;
  const rows: BriefingRow[] = [
    {
      ...POD,
      value: `Matures at the end of turn ${formatWhole(SPAWN_TUNING.podMaturityTurn)}`,
    },
  ];
  const spec = mission.crashSite;
  if (spec !== undefined) {
    const city =
      findCity(ctx.state.overworld.map, spec.landingCityId)?.name ??
      spec.landingCityId;
    rows.push({
      ...LANDING,
      value: `${city} · +${formatWhole(tuning.landingInfestation)} now · erased if the pod falls`,
    });
  }
  rows.push({
    ...TECH_BONUS,
    value: `TP ×${String(tuning.techPointMultiplier)}`,
  });
  return rows;
}

/**
 * A crash site says what became of the pod instead of the generic line:
 * wrecked (the landing is burned out), matured (it burst and the landing
 * takes root), or left standing when the force pulled out or fell.
 * Undefined for any result without a pod.
 */
function crashSiteTagline(
  result: MissionResult,
  ctx: MissionPresentationContext,
): string | undefined {
  if (result.podDestroyed === undefined) {
    return undefined;
  }
  const city =
    findCity(ctx.state.overworld.map, result.cityId)?.name ?? result.cityId;
  if (result.podDestroyed) {
    return result.outcome === "won"
      ? `The spore pod is wreckage and the landing at ${city} is burned out. The force is coming home with full rewards.`
      : `The spore pod is wreckage and the landing at ${city} is burned out, but the force did not make it home.`;
  }
  const matured = result.objectives?.some((objective) => objective.failed);
  if (matured === true) {
    return `The spore pod matured and burst. The landing at ${city} takes root.`;
  }
  return `The force left the spore pod standing. The landing at ${city} takes root.`;
}

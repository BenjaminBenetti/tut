import type { Mission } from "../../../overworld/model/mission";
import { CRASH_SITE_SETUP_TUNING } from "../../../tactical/data/crash-site-setup-tuning";
import { GREAT_POD_SETUP_TUNING } from "../../../tactical/data/great-pod-setup-tuning";
import { SPAWN_TUNING } from "../../../tactical/data/spawn-tuning";
import {
  greatPodCoreHp,
  greatPodRipenTurn,
} from "../../../tactical/service/missions/great-pod-setup";
import type {
  BriefingField,
  BriefingRow,
} from "../../model/mission-presentation";
import type { StoryPresentation } from "../../model/story-presentation";
import { formatWhole } from "../format";

// ===========================================
// Briefing fields
// ===========================================

/** What the squad has to do. */
const OBJECTIVE: BriefingField = {
  field: "story-objective",
  label: "Objective",
};

/** The core's clock and its hit points. */
const CORE: BriefingField = { field: "story-core", label: "Pod core" };

/** What opens the hull. */
const HULL: BriefingField = { field: "story-hull", label: "Hull" };

/**
 * The crash site's row that would mislead here: its spore pod matures
 * on the crash site's clock, the great pod's core on a later one.
 */
const REPLACED_CRASH_SITE_FIELDS: readonly string[] = ["pod"];

// ===========================================
// Presentation
// ===========================================

/**
 * First Skyfall (campaign arc §6.9, #1238): the first crash site, where
 * the pod came down whole. The briefing says to breach the hull and
 * destroy the core, when the core ripens and how hard it is, and what
 * opens the hull; it replaces the crash site's clock row and keeps its
 * landing and tech bonus rows.
 *
 * ```
 *   Briefing · First Skyfall
 *   The first pod came down whole. …
 *   Objective    Breach the pod's hull, destroy its core, then extract
 *   Pod core     Ripens at the end of turn 12 · 80 hp
 *   Hull         Rockets and breaching charges open a plate; grenades
 *                and mech guns open a glowing seam
 *   Fresh landing  Lagos · +10 now · erased if the pod falls
 *   Tech bonus     TP ×1.5
 * ```
 *
 * The clock and the hit points are the shipped tuning's
 * (`greatPodRipenTurn`, `greatPodCoreHp`), the same the rules read.
 */
export const FIRST_SKYFALL_PRESENTATION: StoryPresentation = {
  storyId: "first-skyfall",
  description:
    "The first pod came down whole: a hull the size of a building, sealed round a living core. Breach the pod's hull and destroy its core before it ripens, then extract. Its chambers are not empty.",
  briefingFields: [OBJECTIVE, CORE, HULL],
  briefingRows: firstSkyfallRows,
  replacesTypeFields: REPLACED_CRASH_SITE_FIELDS,
};

// ===========================================
// Helpers
// ===========================================

/** The objective, the core's clock and hit points at the offer's difficulty, and the hull. */
function firstSkyfallRows(mission: Mission): readonly BriefingRow[] {
  const ripens = greatPodRipenTurn(
    mission.difficulty,
    { spawnTuning: SPAWN_TUNING, crashSite: CRASH_SITE_SETUP_TUNING },
    GREAT_POD_SETUP_TUNING,
  );
  const hp = greatPodCoreHp(mission.difficulty, GREAT_POD_SETUP_TUNING);
  return [
    {
      ...OBJECTIVE,
      value: "Breach the pod's hull, destroy its core, then extract",
    },
    {
      ...CORE,
      value: `Ripens at the end of turn ${formatWhole(ripens)} · ${formatWhole(hp)} hp`,
    },
    {
      ...HULL,
      value:
        "Rockets and breaching charges open a plate; grenades and mech guns open a glowing seam",
    },
  ];
}

import type { Mission } from "../../../overworld/model/mission";
import type {
  BriefingField,
  BriefingRow,
  MissionPresentation,
} from "../../model/mission-presentation";

// ===========================================
// Briefing fields
// ===========================================

/** The two maps the mission is fought over, and that nothing mends between them. */
export const PLATFORM_STAGES: BriefingField = {
  field: "platform-stages",
  label: "Stages",
};

/** What wins the mission, and who stands in the way. */
export const PLATFORM_OBJECTIVE: BriefingField = {
  field: "platform-objective",
  label: "Target",
};

// ===========================================
// Copy
// ===========================================

/** The stages row: the hull, then the core, with no repairs between. */
export const PLATFORM_STAGES_TEXT =
  "Two stages: the hull, then the core. No repairs between them.";

/** The target row: the core, and the Sovereign guarding it. */
export const PLATFORM_OBJECTIVE_TEXT =
  "Destroy the platform core. The Sovereign guards it.";

/** The transition's headline once the hull is won. */
export const PLATFORM_HULL_CLEARED = "Hull cleared. The squad boards the core.";

// ===========================================
// Presentation
// ===========================================

/**
 * Spore Platform (campaign arc §6.9, #1179): the finale as a mission
 * type, the global threat's glyph in the mission list (the crash site
 * already shows the pod) and two rows in the briefing that
 * hold for every platform offer. What the campaign stakes on it (the
 * win, the first loss, the retry) is the story's to say
 * (`SPORE_PLATFORM_STORY_PRESENTATION`), as is the debrief's line.
 *
 * ```
 *   Stages   Two stages: the hull, then the core. No repairs between them.
 *   Target   Destroy the platform core. The Sovereign guards it.
 *
 *   between the stages: "Hull cleared. The squad boards the core."
 * ```
 */
export const SPORE_PLATFORM_PRESENTATION: MissionPresentation = {
  typeId: "spore-platform",
  icon: "threat",
  briefingFields: [PLATFORM_STAGES, PLATFORM_OBJECTIVE],
  briefingRows: sporePlatformRows,
  stageTransition: sporePlatformTransition,
};

// ===========================================
// Helpers
// ===========================================

/**
 * The stages and the target: the same for every platform offer, so the
 * offer itself is not read.
 */
function sporePlatformRows(_mission: Mission): readonly BriefingRow[] {
  return [
    { ...PLATFORM_STAGES, value: PLATFORM_STAGES_TEXT },
    { ...PLATFORM_OBJECTIVE, value: PLATFORM_OBJECTIVE_TEXT },
  ];
}

/**
 * The headline once the hull (stage 0) is won; the core is the last
 * stage, so nothing follows it.
 *
 * @param from - The stage just won.
 */
function sporePlatformTransition(from: number): string | undefined {
  return from === 0 ? PLATFORM_HULL_CLEARED : undefined;
}

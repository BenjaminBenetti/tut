import type {
  BriefingRow,
  MissionPresentation,
} from "../../model/mission-presentation";

// ===========================================
// Presentation
// ===========================================

/**
 * Infestation clearance: the egg glyph in the list, and nothing of its
 * own in the briefing or the debrief. Everything a clearance has to say
 * (the city, the reward, a reported tech carcass) is on the shared
 * grid, and the outcome's generic line already describes a clearance.
 */
export const INFESTATION_CLEARANCE_PRESENTATION: MissionPresentation = {
  typeId: "infestation-clearance",
  icon: "infestation",
  briefingFields: [],
  briefingRows: noRows,
};

// ===========================================
// Helpers
// ===========================================

/** A clearance adds no rows to the shared briefing grid. */
function noRows(): readonly BriefingRow[] {
  return [];
}

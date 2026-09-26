import { MISSION_TYPE_IDS } from "../../../content/model/mission-type-id";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { STARTER_PARTS } from "../../../roster/data/parts";
import { StaticPartCatalogue } from "../../../roster/repository/static-part-catalogue";
import type {
  BriefingField,
  MissionPresentationCatalogue,
  MissionPresentationContext,
} from "../../model/mission-presentation";
import { CRASH_SITE_PRESENTATION } from "./crash-site-presentation";
import { DEFEND_INSTALLATION_PRESENTATION } from "./defend-installation-presentation";
import { EVACUATION_PRESENTATION } from "./evacuation-presentation";
import { INFESTATION_CLEARANCE_PRESENTATION } from "./infestation-clearance-presentation";
import { createWreckRecoveryPresentation } from "./wreck-recovery-presentation";

// ===========================================
// Table
// ===========================================

/**
 * How the UI shows each mission type (ADR 0013 §2.3). One module per
 * type; a new type adds its module and one line here, and the compiler
 * lists this table until it does.
 *
 * ```
 *   infestation-clearance  ──► infestation-clearance-presentation.ts
 *   defend-installation    ──► defend-installation-presentation.ts
 *   crash-site             ──► crash-site-presentation.ts
 *   wreck-recovery         ──► wreck-recovery-presentation.ts (over the shipped parts)
 *   evacuation             ──► evacuation-presentation.ts
 * ```
 *
 * The wreck's rows name parts, so its entry is built over the shipped
 * part catalogue, as the defence's reads the shipped installation sites.
 */
export const MISSION_PRESENTATION: MissionPresentationCatalogue = {
  "infestation-clearance": INFESTATION_CLEARANCE_PRESENTATION,
  "defend-installation": DEFEND_INSTALLATION_PRESENTATION,
  "crash-site": CRASH_SITE_PRESENTATION,
  "wreck-recovery": createWreckRecoveryPresentation(
    new StaticPartCatalogue(STARTER_PARTS),
  ),
  evacuation: EVACUATION_PRESENTATION,
};

// ===========================================
// Queries
// ===========================================

/**
 * Every field any type can add to the briefing, in `MISSION_TYPE_IDS`
 * order, each key once: the slots the briefing builds at mount. Two
 * types may share a field; the first to declare it sets its place.
 */
export function briefingFieldsOf(
  presentations: MissionPresentationCatalogue,
): readonly BriefingField[] {
  const seen = new Set<string>();
  const fields: BriefingField[] = [];
  for (const typeId of MISSION_TYPE_IDS) {
    for (const field of presentations[typeId].briefingFields) {
      if (!seen.has(field.field)) {
        seen.add(field.field);
        fields.push(field);
      }
    }
  }
  return fields;
}

/**
 * The debrief's type-specific line for `result`, or undefined to keep
 * the outcome's generic one.
 *
 * A `MissionResult` carries no type id: the offer is removed in the same
 * update that stores the result. So every type is asked in
 * `MISSION_TYPE_IDS` order and the first answer wins; each tagline reads
 * its own payload (`result.defence`, `result.podDestroyed`) and answers
 * undefined otherwise.
 */
export function debriefTaglineFor(
  result: MissionResult,
  ctx: MissionPresentationContext,
  presentations: MissionPresentationCatalogue = MISSION_PRESENTATION,
): string | undefined {
  for (const typeId of MISSION_TYPE_IDS) {
    const tagline = presentations[typeId].debriefTagline?.(result, ctx);
    if (tagline !== undefined) {
      return tagline;
    }
  }
  return undefined;
}

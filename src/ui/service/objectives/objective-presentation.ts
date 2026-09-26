import type {
  ObjectiveId,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import type {
  ObjectiveKind,
  ObjectivePresentationCatalogue,
  ObjectiveProgressReadings,
} from "../../model/objective-presentation";
import { DEFEND_GENERATORS_PRESENTATION } from "./defend-generators-presentation";
import { DESTROY_POD_PRESENTATION } from "./destroy-pod-presentation";
import { DESTROY_SPAWNER_PRESENTATION } from "./destroy-spawner-presentation";

// ===========================================
// Table
// ===========================================

/**
 * How the UI shows each objective kind (ADR 0013 §2.3): the tracker,
 * the log and the refusals all go through it, so no view branches on a
 * kind. One module per kind; a new kind adds its module and one line
 * here, and the compiler lists this table until it does.
 *
 * ```
 *   destroy-spawner    ──► destroy-spawner-presentation.ts
 *   defend-generators  ──► defend-generators-presentation.ts
 *   destroy-pod        ──► destroy-pod-presentation.ts
 * ```
 */
export const OBJECTIVE_PRESENTATION: ObjectivePresentationCatalogue = {
  "destroy-spawner": DESTROY_SPAWNER_PRESENTATION,
  "defend-generators": DEFEND_GENERATORS_PRESENTATION,
  "destroy-pod": DESTROY_POD_PRESENTATION,
} satisfies { readonly [K in ObjectiveKind]: { readonly kind: K } };

// ===========================================
// Queries
// ===========================================

/**
 * Every objective's live reading, keyed by its id, for the kinds that
 * take one (#1175). The HUD hands the result to the tracker, which
 * gives each reading back to the kind that took it.
 */
export function objectiveProgress(
  mission: TacticalState,
  presentations: ObjectivePresentationCatalogue = OBJECTIVE_PRESENTATION,
): ObjectiveProgressReadings {
  const readings = new Map<ObjectiveId, unknown>();
  for (const objective of mission.objectives) {
    const presentation = presentations[objective.kind];
    if (presentation.progress !== undefined) {
      readings.set(objective.id, presentation.progress(objective, mission));
    }
  }
  return readings;
}

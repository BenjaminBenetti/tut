import type { ModelAssetId } from "../../content/data/model-ids";
import type { Unit } from "./unit";

// ===========================================
// Civilian
// ===========================================

/**
 * `sourceId` of every civilian group (campaign arc §6.4). Civilians are
 * the town's, not the roster's: one template per mission, never a
 * debrief casualty, never credited with a kill.
 */
export const CIVILIAN_SOURCE_ID = "civilians";

/**
 * What a civilian group is (campaign arc §6.4): a few townsfolk who move
 * and board like a squad, carry nothing and never attack. Modest hit
 * points so a bug that reaches one does real harm; a short `sightRange`
 * because they are looking at their feet, not the street.
 */
export interface CivilianTuning {
  readonly name: string;
  readonly maxHp: number;
  readonly armor: number;
  /** Tiles a group walks for one action point. */
  readonly move: number;
  readonly maxAp: number;
  readonly sightRange: number;
  readonly modelId: ModelAssetId;
}

// ===========================================
// Helpers
// ===========================================

/** True for a civilian group, trapped, freed or dead. */
export function isCivilian(unit: Pick<Unit, "kind">): boolean {
  return unit.kind === "civilian";
}

/** True for a civilian group still shut in its building, waiting to be freed. */
export function isTrapped(unit: Pick<Unit, "kind" | "trapped">): boolean {
  return unit.kind === "civilian" && unit.trapped === true;
}

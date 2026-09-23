import type { ModelAssetId } from "../../content/data/model-ids";
import type { Unit } from "./unit";

// ===========================================
// Generator
// ===========================================

/**
 * `sourceId` of every generator (#1175). Generators are the map's, not
 * the roster's: one template per mission, never a debrief entry.
 */
export const GENERATOR_SOURCE_ID = "generator";

/**
 * What a generator is made of (#1175). No weapon and no movement: it is
 * a thing the squad stands in front of. `sightRange` is small so it
 * lights its own yard and no more.
 */
export interface GeneratorTuning {
  readonly name: string;
  readonly maxHp: number;
  readonly armor: number;
  readonly sightRange: number;
  readonly modelId: ModelAssetId;
}

// ===========================================
// Helpers
// ===========================================

/** True for a generator, standing or wrecked. */
export function isGenerator(unit: Pick<Unit, "kind">): boolean {
  return unit.kind === "generator";
}

/** True for a generator still running. */
export function generatorStanding(unit: Pick<Unit, "kind" | "hp">): boolean {
  return unit.kind === "generator" && unit.hp > 0;
}

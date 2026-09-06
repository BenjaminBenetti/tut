import type { ModelAssetId } from "../../content/data/model-ids";

/** Brushed steel on modern facades; weathered steel on brickwork. */
export type LadderFinish = "brushed" | "weathered";

/** One section of a connector; the whole ladder shares its finish and arrival vision. */
export interface LadderAppearance {
  readonly id: string;
  readonly finish: LadderFinish;
  /** Actual supporting wall model, retained for diagnostics rather than inferred from terrain. */
  readonly supportModel: ModelAssetId;
}

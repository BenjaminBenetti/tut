import type { ModelAssetId } from "../../content/data/model-ids";
import type { Rotation } from "../../mapgen/model/prop";

/** Interchangeable art with the same tactical footprint and cover silhouette. */
export interface PropModelVariant {
  readonly modelId: ModelAssetId;
  /** Aligns the authored longitudinal axis with the base model. */
  readonly turns: Rotation;
}

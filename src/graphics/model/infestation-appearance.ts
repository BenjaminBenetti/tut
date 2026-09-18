import type { ModelAssetId } from "../../content/data/model-ids";

/** Colony dressing controls: collision remains owned by generated map props. */
export interface InfestationAppearance {
  readonly dominantGround: ModelAssetId;
  readonly groundReliefShare: number;
  readonly nestReliefShare: number;
  readonly ground: readonly ModelAssetId[];
  readonly nestGround: readonly ModelAssetId[];
  readonly groundDetail: readonly ModelAssetId[];
  readonly edgeDetail: readonly ModelAssetId[];
  readonly detailShare: number;
  readonly edgeShare: number;
  readonly detailMinScale: number;
  readonly poolShare: number;
}

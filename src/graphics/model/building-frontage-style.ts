import type { ModelAssetId } from "../../content/data/model-ids";

/** Dimensions and mount height of an attachment to an existing exterior wall. */
export interface BuildingFrontageModule {
  readonly modelId: ModelAssetId;
  /** Width along the wall, used to avoid wrapping a canopy around a corner. */
  readonly width: number;
  /** Lowest point above the owning floor's top. */
  readonly mountHeight: number;
}

/** Exterior use cues; the building record remains the authority on its use. */
export interface BuildingFrontageStyle {
  readonly entrance: BuildingFrontageModule;
  readonly domesticWindows?: boolean;
  readonly sharedMail?: boolean;
}

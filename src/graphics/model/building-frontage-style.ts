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
  /** First clear fit wins; a narrow retail awning keeps adjacent ladders clear. */
  readonly entrances: readonly BuildingFrontageModule[];
  /** Alternative coherent entrance styles, each retaining its own narrow fallback. */
  readonly entranceVariants?: readonly (readonly BuildingFrontageModule[])[];
  readonly domesticWindows?: boolean;
  readonly sharedMail?: boolean;
  /** Mounted only on selected solid upper-storey bays, clear of all apertures. */
  readonly wallUtility?: BuildingFrontageModule;
}

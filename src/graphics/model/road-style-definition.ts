import type { KnownSurfaceId } from "../../mapgen/data/surfaces";

/** Surface and detail choices for the same carriageway geometry. */
export interface RoadStyleDefinition {
  readonly surface: KnownSurfaceId;
  readonly kerbs: boolean;
  readonly markings: boolean;
}

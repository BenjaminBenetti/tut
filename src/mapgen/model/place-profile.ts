import type { PlaceProfileId } from "../../content/model/place-profile-id";
import type { BiomeDefinition } from "./biome-definition";

/** Local environmental choices layered onto a biome, never its global definition. */
export interface PlaceProfile {
  readonly id: PlaceProfileId;
  readonly environment: Partial<Omit<BiomeDefinition, "id">>;
}

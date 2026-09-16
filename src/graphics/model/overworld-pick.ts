import type { CityId } from "../../overworld/model/city";
import type { RegionId } from "../../overworld/model/region";

// ===========================================
// Types
// ===========================================

/** A settlement under the pointer. */
export interface CityPick {
  readonly kind: "city";
  readonly cityId: CityId;
}

/** A region's land under the pointer, with no settlement on it. */
export interface RegionPick {
  readonly kind: "region";
  readonly regionId: RegionId;
}

/**
 * What a pointer can land on over the strategic map (#1155): a
 * settlement, or the bare land of a region. The sea is not a pick; a
 * click there reports a miss and clears the selection.
 */
export type OverworldPick = CityPick | RegionPick;

// ===========================================
// Constructors
// ===========================================

/** A pick of one settlement. */
export function cityPick(cityId: CityId): CityPick {
  return { kind: "city", cityId };
}

/** A pick of one region's land. */
export function regionPick(regionId: RegionId): RegionPick {
  return { kind: "region", regionId };
}

// ===========================================
// Comparison
// ===========================================

/** True when two picks name the same thing. */
export function samePick(a: OverworldPick, b: OverworldPick): boolean {
  if (a.kind === "city") {
    return b.kind === "city" && a.cityId === b.cityId;
  }
  return b.kind === "region" && a.regionId === b.regionId;
}

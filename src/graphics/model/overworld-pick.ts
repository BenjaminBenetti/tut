import type { CityId } from "../../overworld/model/city";
import type { DeployableId } from "../../overworld/model/deployable";
import type { RegionId } from "../../overworld/model/region";

// ===========================================
// Types
// ===========================================

/** A settlement under the pointer. */
export interface CityPick {
  readonly kind: "city";
  readonly cityId: CityId;
}

/** A built installation under the pointer (#1155). */
export interface InstallationPick {
  readonly kind: "installation";
  readonly deployableId: DeployableId;
}

/** A region's land under the pointer, with no settlement or installation on it. */
export interface RegionPick {
  readonly kind: "region";
  readonly regionId: RegionId;
}

/**
 * What a pointer can land on over the strategic map (#1155): a
 * settlement, a built installation, or the bare land of a region. The
 * sea is not a pick; a click there reports a miss and clears the
 * selection.
 */
export type OverworldPick = CityPick | InstallationPick | RegionPick;

// ===========================================
// Constructors
// ===========================================

/** A pick of one settlement. */
export function cityPick(cityId: CityId): CityPick {
  return { kind: "city", cityId };
}

/** A pick of one built installation. */
export function installationPick(deployableId: DeployableId): InstallationPick {
  return { kind: "installation", deployableId };
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
  switch (a.kind) {
    case "city":
      return b.kind === "city" && a.cityId === b.cityId;
    case "installation":
      return b.kind === "installation" && a.deployableId === b.deployableId;
    case "region":
      return b.kind === "region" && a.regionId === b.regionId;
  }
}

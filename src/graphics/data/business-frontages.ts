import type { ModelAssetId } from "../../content/data/model-ids";
import type {
  BuildingFrontageModule,
  BusinessFrontageKind,
} from "../model/building-frontage-style";

/** Wide branded canopies and legible compact identities share their wall mounting contract. */
export const BUSINESS_ENTRANCES: Readonly<
  Record<BusinessFrontageKind, readonly BuildingFrontageModule[]>
> = {
  grocery: modules(
    "building.business-grocery",
    "building.business-grocery-compact",
  ),
  "bakery-cafe": modules(
    "building.business-bakery-cafe",
    "building.business-bakery-cafe-compact",
  ),
  pharmacy: modules(
    "building.business-pharmacy",
    "building.business-pharmacy-compact",
  ),
  clothing: modules(
    "building.business-clothing",
    "building.business-clothing-compact",
  ),
  electronics: modules(
    "building.business-electronics",
    "building.business-electronics-compact",
  ),
  hardware: modules(
    "building.business-hardware",
    "building.business-hardware-compact",
  ),
  bookshop: modules(
    "building.business-bookshop",
    "building.business-bookshop-compact",
  ),
  offices: modules(
    "building.business-offices",
    "building.business-offices-compact",
  ),
  depot: modules("building.business-depot", "building.business-depot-compact"),
};

/** Try the full business frontage first, retaining its identity when only one bay fits. */
function modules(
  wide: ModelAssetId,
  compact: ModelAssetId,
): readonly BuildingFrontageModule[] {
  return [
    { modelId: wide, width: 3, mountHeight: 1.08 },
    { modelId: compact, width: 1, mountHeight: 1.08 },
  ];
}

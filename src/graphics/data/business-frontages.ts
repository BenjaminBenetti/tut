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
    "grocery",
    "building.business-grocery",
    "building.business-grocery-compact",
  ),
  "bakery-cafe": modules(
    "bakery-cafe",
    "building.business-bakery-cafe",
    "building.business-bakery-cafe-compact",
  ),
  pharmacy: modules(
    "pharmacy",
    "building.business-pharmacy",
    "building.business-pharmacy-compact",
  ),
  clothing: modules(
    "clothing",
    "building.business-clothing",
    "building.business-clothing-compact",
  ),
  electronics: modules(
    "electronics",
    "building.business-electronics",
    "building.business-electronics-compact",
  ),
  hardware: modules(
    "hardware",
    "building.business-hardware",
    "building.business-hardware-compact",
  ),
  bookshop: modules(
    "bookshop",
    "building.business-bookshop",
    "building.business-bookshop-compact",
  ),
  offices: modules(
    "offices",
    "building.business-offices",
    "building.business-offices-compact",
  ),
  depot: modules(
    "depot",
    "building.business-depot",
    "building.business-depot-compact",
  ),
};

/** Try the full business frontage first, retaining its identity when only one bay fits. */
function modules(
  businessKind: BusinessFrontageKind,
  wide: ModelAssetId,
  compact: ModelAssetId,
): readonly BuildingFrontageModule[] {
  return [
    { modelId: wide, businessKind, width: 3, mountHeight: 1.08 },
    { modelId: compact, width: 1, mountHeight: 1.08 },
  ];
}

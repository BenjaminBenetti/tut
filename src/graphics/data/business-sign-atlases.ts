import type { BusinessFrontageKind } from "../model/building-frontage-style";
import type { BusinessSignAtlasLayout } from "../model/business-sign-atlas";
import type { TextureId } from "./texture-manifest";

/** Ten padded, full-resolution labels per shared texture page. */
export const BUSINESS_SIGN_ATLAS_LAYOUT: BusinessSignAtlasLayout = {
  width: 1024,
  height: 1024,
  labelsPerPage: 10,
  labelHeight: 96,
  rowStride: 102,
  topInset: 3,
};

/** Only the pages used on a map are fetched, through the ordinary cached texture source. */
export const BUSINESS_SIGN_ATLASES: Readonly<
  Record<BusinessFrontageKind, readonly TextureId[]>
> = {
  grocery: [
    "business.grocery.0",
    "business.grocery.1",
    "business.grocery.2",
    "business.grocery.3",
    "business.grocery.4",
  ],
  "bakery-cafe": [
    "business.bakery-cafe.0",
    "business.bakery-cafe.1",
    "business.bakery-cafe.2",
    "business.bakery-cafe.3",
    "business.bakery-cafe.4",
  ],
  pharmacy: [
    "business.pharmacy.0",
    "business.pharmacy.1",
    "business.pharmacy.2",
    "business.pharmacy.3",
    "business.pharmacy.4",
  ],
  clothing: [
    "business.clothing.0",
    "business.clothing.1",
    "business.clothing.2",
    "business.clothing.3",
    "business.clothing.4",
  ],
  electronics: [
    "business.electronics.0",
    "business.electronics.1",
    "business.electronics.2",
    "business.electronics.3",
    "business.electronics.4",
  ],
  hardware: [
    "business.hardware.0",
    "business.hardware.1",
    "business.hardware.2",
    "business.hardware.3",
    "business.hardware.4",
  ],
  bookshop: [
    "business.bookshop.0",
    "business.bookshop.1",
    "business.bookshop.2",
    "business.bookshop.3",
    "business.bookshop.4",
  ],
  offices: [
    "business.offices.0",
    "business.offices.1",
    "business.offices.2",
    "business.offices.3",
    "business.offices.4",
  ],
  depot: [
    "business.depot.0",
    "business.depot.1",
    "business.depot.2",
    "business.depot.3",
    "business.depot.4",
  ],
};

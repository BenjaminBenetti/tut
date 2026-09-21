import { PropKindIds as Prop } from "../../mapgen/data/props";
import type { InteriorFurnitureStyle } from "../model/interior-furniture-style";

/** Maximum relief depth of authored wall kits, plus 5 mm of visual clearance. */
export const BUILDING_FURNITURE_CLEARANCE: Readonly<Record<string, number>> = {
  bank: 0.15,
  "defensive-battery": 0.15,
  "sensor-array": 0.1,
  "repellent-dispersal": 0.185,
};

/**
 * Rear extents measured from the shipped GLBs, guarded by the furniture asset
 * tests. Shallow wall furniture moves straight back until it clears the wall's
 * 0.05-u half thickness. The nearly full-depth bed stays at its authored pivot;
 * checkout counters, dining/meeting sets and planters remain freestanding.
 */
export const INTERIOR_FURNITURE_STYLE: InteriorFurnitureStyle = {
  wallClearance: 0.055,
  rearExtents: {
    [Prop.PRODUCE_BIN]: 0.293,
    [Prop.CHILLED_DISPLAY]: 0.275,
    [Prop.BAKERY_CASE]: 0.275,
    [Prop.COFFEE_COUNTER]: 0.295,
    [Prop.CLOTHING_RACK]: 0.21,
    [Prop.ELECTRONICS_DISPLAY]: 0.25,
    [Prop.HARDWARE_SHELF]: 0.2,
    [Prop.PHARMACY_SHELF]: 0.1835,
    [Prop.RETAIL_SHELF]: 0.22,
    [Prop.DESK_COMPUTER]: 0.34,
    [Prop.FILING_CABINET]: 0.225,
    [Prop.WORKBENCH]: 0.26,
    [Prop.SOFA]: 0.25,
    [Prop.BED]: 0.485,
    [Prop.KITCHEN_COUNTER]: 0.2255,
    [Prop.BATHROOM_VANITY]: 0.2025,
    [Prop.TOILET]: 0.2435,
    [Prop.REFRIGERATOR]: 0.218,
    [Prop.WARDROBE]: 0.255,
    [Prop.BOOKCASE]: 0.19,
  },
};

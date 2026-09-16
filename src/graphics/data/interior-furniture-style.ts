import { PropKindIds as Prop } from "../../mapgen/data/props";
import type { InteriorFurnitureStyle } from "../model/interior-furniture-style";

/**
 * Rear extents measured from the shipped GLBs, guarded by the furniture asset
 * tests. Shallow wall furniture moves straight back until it clears the wall's
 * 0.05-u half thickness. The nearly full-depth bed stays at its authored pivot;
 * checkout counters, dining/meeting sets and planters remain freestanding.
 */
export const INTERIOR_FURNITURE_STYLE: InteriorFurnitureStyle = {
  wallClearance: 0.055,
  rearExtents: {
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

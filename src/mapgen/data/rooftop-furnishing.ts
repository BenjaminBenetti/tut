import type { RooftopFurnishing } from "../model/rooftop-furnishing";
import { PropKindIds } from "./props";

/** Compact service rows distinguish housing, shops and industrial roofs. */
export const ROOFTOP_FURNISHING: Readonly<Record<string, RooftopFurnishing>> = {
  apartment: {
    props: [PropKindIds.ROOFTOP_WATER_TANK, PropKindIds.ROOFTOP_HVAC],
    tilesPerProp: 32,
    maxProps: 3,
    spacing: 2,
  },
  tower: {
    props: [
      PropKindIds.ROOFTOP_HVAC,
      PropKindIds.ROOFTOP_HVAC,
      PropKindIds.ROOFTOP_WATER_TANK,
    ],
    tilesPerProp: 32,
    maxProps: 3,
    spacing: 2,
  },
  shop: {
    props: [PropKindIds.ROOFTOP_HVAC, PropKindIds.ROOFTOP_WATER_TANK],
    tilesPerProp: 32,
    maxProps: 2,
    spacing: 2,
  },
  warehouse: {
    props: [PropKindIds.ROOFTOP_HVAC],
    tilesPerProp: 40,
    maxProps: 3,
    spacing: 2,
  },
};

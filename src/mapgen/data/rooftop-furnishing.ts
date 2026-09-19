import type { RooftopFurnishing } from "../model/rooftop-furnishing";
import type { PropKindId } from "../model/prop";
import { PropKindIds } from "./props";

/** The roof the four installations share (#1175). */
/**
 * An installation's roof (#1175): its signature piece first, always,
 * then plant if the roof is big enough.
 */
function installationRoof(signature: PropKindId): RooftopFurnishing {
  return {
    props: [signature, PropKindIds.ROOFTOP_HVAC],
    tilesPerProp: 40,
    maxProps: 2,
    spacing: 2,
    minProps: 1,
  };
}

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
  // Installations (#1175): plant on the roof, but room left to fight from it.
  "sensor-array": installationRoof(PropKindIds.SENSOR_MAST),
  "repellent-dispersal": installationRoof(PropKindIds.DISPERSAL_STACK),
  "defensive-battery": installationRoof(PropKindIds.BATTERY_EMPLACEMENT),
  bank: installationRoof(PropKindIds.STRONGROOM),
};

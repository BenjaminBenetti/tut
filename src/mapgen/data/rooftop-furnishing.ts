import type { RooftopFurnishing } from "../model/rooftop-furnishing";
import type { PropKindId } from "../model/prop";
import { PropKindIds } from "./props";

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
  "sensor-array": {
    props: [PropKindIds.INSTALLATION_RADAR],
    tilesPerProp: 120,
    maxProps: 1,
    minProps: 1,
    spacing: 6,
  },
  "repellent-dispersal": installationRoof(PropKindIds.DISPERSAL_STACK),
  "defensive-battery": {
    props: [PropKindIds.INSTALLATION_CANNON],
    tilesPerProp: 120,
    maxProps: 1,
    minProps: 1,
    spacing: 6,
  },
  bank: {
    props: [PropKindIds.ROOFTOP_HVAC],
    tilesPerProp: 70,
    maxProps: 2,
    spacing: 3,
  },
};

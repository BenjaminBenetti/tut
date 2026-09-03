import type { SettlementScale } from "../../content/model/settlement-scale";
import type { SettlementDefinition } from "../model/settlement-definition";

// ===========================================
// Settlement definitions
// ===========================================

/**
 * The three M1.5 settlement scales (GDD §7), keyed by id so the compiler
 * fails when a scale has no definition. Numbers are conservative starting
 * points; tune them in the preview harness, not in passes.
 */
export const SETTLEMENT_DEFINITIONS: Readonly<
  Record<SettlementScale, SettlementDefinition>
> = {
  rural: {
    id: "rural",
    roadStyle: "trail",
    sideStreets: { min: 0, max: 0 },
    blockSize: 0,
    blockJitter: 0,
    roadWidth: 1,
    pavedRoads: false,
    sidewalks: false,
    lotWidth: { min: 5, max: 8 },
    lotDepth: { min: 5, max: 8 },
    buildingCount: { min: 1, max: 3 },
    floorCount: { min: 1, max: 2 },
    streetPropDensity: 1,
    yardPropDensity: 3,
    rampSpacing: 8,
  },
  town: {
    id: "town",
    roadStyle: "streets",
    sideStreets: { min: 2, max: 4 },
    blockSize: 0,
    blockJitter: 0,
    roadWidth: 1,
    pavedRoads: true,
    sidewalks: true,
    lotWidth: { min: 4, max: 7 },
    lotDepth: { min: 4, max: 7 },
    buildingCount: { min: 6, max: 12 },
    floorCount: { min: 1, max: 3 },
    streetPropDensity: 3,
    yardPropDensity: 10,
    rampSpacing: 7,
  },
  city: {
    id: "city",
    roadStyle: "grid",
    sideStreets: { min: 0, max: 0 },
    blockSize: 12,
    blockJitter: 2,
    roadWidth: 2,
    pavedRoads: true,
    sidewalks: true,
    lotWidth: { min: 3, max: 6 },
    lotDepth: { min: 3, max: 6 },
    buildingCount: { min: 12, max: 24 },
    floorCount: { min: 2, max: 5 },
    streetPropDensity: 5,
    yardPropDensity: 14,
    rampSpacing: 4,
  },
};

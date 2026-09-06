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
    roadWidth: 2,
    pavedRoads: false,
    sidewalkWidth: 0,
    lotWidth: { min: 10, max: 16 },
    lotDepth: { min: 10, max: 16 },
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
    roadWidth: 3,
    pavedRoads: true,
    sidewalkWidth: 1,
    lotWidth: { min: 8, max: 14 },
    lotDepth: { min: 8, max: 14 },
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
    blockSize: 26,
    blockJitter: 3,
    roadWidth: 4,
    pavedRoads: true,
    sidewalkWidth: 2,
    lotWidth: { min: 7, max: 12 },
    lotDepth: { min: 7, max: 10 },
    buildingCount: { min: 12, max: 24 },
    floorCount: { min: 2, max: 5 },
    streetPropDensity: 5,
    yardPropDensity: 14,
    rampSpacing: 4,
    // The knob behind #512: how much of a city stands one level up.
    // Attempts, not placements — the plat runs out of room long before
    // the count does, so a medium map lands around 380 raised columns
    // whatever this says above about forty. Lowering it takes cities back
    // toward flat; raising it only costs generation time.
    elevatedFeatures: { min: 44, max: 56 },
  },
};

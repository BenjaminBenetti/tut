import { SurfaceIds } from "./surfaces";
import type { ElevatedFeature } from "../model/elevated-feature";

// ===========================================
// Elevated features (#512)
// ===========================================

/**
 * The raised outdoor structures a city plat can carry. City blocks are
 * graded flat and mechs cannot use roofs, so without these a mech never
 * holds height on a city map (#444); each of these is one level up and
 * reachable by both classes over the ramps the ramp pass adds.
 *
 * They are city vocabulary on purpose — a viaduct, a plaza, a rail
 * embankment — rather than terrain: a hill dropped into a downtown reads
 * as a mistake. Sizes are in columns, and the ranges are what fits
 * between a 12-column block grid and the lots inside it.
 *
 * The viaduct earns its weight: about seven in ten walkable columns of a
 * city are street or sidewalk, so lifting a run of the grid is the only
 * feature that moves the high-ground share much, and an elevated roadway
 * is the piece of real city that does it. `breadth` is ignored for it —
 * a viaduct takes the corridor it is laid on, sidewalk to sidewalk.
 */
export const ELEVATED_FEATURES: readonly ElevatedFeature[] = [
  {
    id: "viaduct",
    shape: "viaduct",
    surface: SurfaceIds.ROAD,
    length: { min: 12, max: 24 },
    breadth: { min: 1, max: 1 },
    weight: 8,
    scales: ["city"],
  },
  {
    id: "podium",
    shape: "plaza",
    surface: SurfaceIds.SIDEWALK,
    length: { min: 6, max: 11 },
    breadth: { min: 6, max: 9 },
    weight: 3,
    scales: ["city"],
  },
  {
    id: "plaza",
    shape: "plaza",
    surface: SurfaceIds.SIDEWALK,
    length: { min: 5, max: 8 },
    breadth: { min: 4, max: 7 },
    weight: 4,
    scales: ["city"],
  },
  {
    id: "causeway",
    shape: "strip",
    surface: SurfaceIds.ROAD,
    length: { min: 10, max: 18 },
    breadth: { min: 2, max: 3 },
    weight: 3,
    scales: ["city"],
  },
  {
    id: "rail-embankment",
    shape: "strip",
    surface: SurfaceIds.ROCK,
    length: { min: 12, max: 22 },
    breadth: { min: 2, max: 2 },
    weight: 2,
    scales: ["city"],
  },
  {
    id: "terrace",
    shape: "strip",
    surface: SurfaceIds.DIRT,
    length: { min: 6, max: 12 },
    breadth: { min: 3, max: 4 },
    weight: 2,
    scales: ["city", "town"],
  },
  {
    id: "raised-park",
    shape: "plaza",
    surface: SurfaceIds.GRASS,
    length: { min: 5, max: 9 },
    breadth: { min: 4, max: 7 },
    weight: 3,
    scales: ["city"],
  },
  {
    id: "rubble-mound",
    shape: "mound",
    surface: SurfaceIds.ROCK,
    length: { min: 4, max: 6 },
    breadth: { min: 4, max: 6 },
    weight: 2,
    scales: ["city", "town"],
  },
];

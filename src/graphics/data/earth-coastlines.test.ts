import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import { projectCoastlines } from "../service/coastline-projection";
import { distanceToLand, isOnLand } from "../service/land-query";
import { layoutToWorld } from "../service/overworld-layout";
import { EARTH_COASTLINES } from "./earth-coastlines";

/** Places every city needs to recognise on the map, as `[name, lat, lon]`. */
const LANDMARKS: readonly (readonly [string, number, number])[] = [
  ["Greenland", 72, -40],
  ["Iceland", 65, -18.5],
  ["Great Britain", 52.5, -1.5],
  ["Japan (Honshu)", 36, 138.5],
  ["New Zealand (South Island)", -44, 170],
  ["Madagascar", -19, 46.5],
  ["Sumatra", -0.5, 101.5],
  ["Borneo", 0.5, 114],
  ["New Guinea", -5, 141],
  ["Antarctica", -80, 0],
  ["Australia", -25, 134],
  ["Sri Lanka", 7.5, 80.7],
];

/** Open water no ring may claim, as `[name, lat, lon]`. */
const OPEN_WATER: readonly (readonly [string, number, number])[] = [
  ["Mid-Pacific", 0, -140],
  ["South Atlantic", -30, -20],
  ["Indian Ocean", -30, 80],
  ["Caspian Sea", 42, 50.5],
];

const polygons = projectCoastlines(EARTH_COASTLINES, OVERWORLD_SCENE_CONFIG);

/** A geographic point as a ground point, through the map's own projection. */
function ground(latitude: number, longitude: number): { x: number; z: number } {
  const world = layoutToWorld(
    { x: (longitude + 180) / 360, y: (90 - latitude) / 180 },
    OVERWORLD_SCENE_CONFIG,
  );
  return { x: world.x, z: world.z };
}

describe("EARTH_COASTLINES", () => {
  it("is a compact set of closed rings inside the globe", () => {
    expect(EARTH_COASTLINES.polygons.length).toBeGreaterThan(100);
    let points = 0;
    for (const polygon of EARTH_COASTLINES.polygons) {
      for (const ring of [polygon.outer, ...polygon.holes]) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        for (const [longitude, latitude] of ring) {
          expect(Math.abs(longitude)).toBeLessThanOrEqual(180);
          expect(Math.abs(latitude)).toBeLessThanOrEqual(90);
        }
        points += ring.length;
      }
    }
    expect(points).toBeLessThan(6000);
  });

  it("recognises the landmasses the map has to read at 1280 px", () => {
    const missing = LANDMARKS.filter(
      ([, lat, lon]) => !isOnLand(ground(lat, lon), polygons),
    ).map(([name]) => name);
    expect(missing).toEqual([]);
    const wet = OPEN_WATER.filter(([, lat, lon]) =>
      isOnLand(ground(lat, lon), polygons),
    ).map(([name]) => name);
    expect(wet).toEqual([]);
  });

  it("puts every city on drawn land, or within half a settlement footprint of it (#1144)", () => {
    const adrift: string[] = [];
    for (const city of EARTH_MAP.cities) {
      const world = layoutToWorld(city.layout, OVERWORLD_SCENE_CONFIG);
      const distance = distanceToLand({ x: world.x, z: world.z }, polygons);
      if (distance > OVERWORLD_SCENE_CONFIG.settlementFootprint / 2) {
        adrift.push(`${city.name} (${distance.toFixed(2)} u from land)`);
      }
    }
    expect(adrift).toEqual([]);
    expect(EARTH_MAP.cities.length).toBeGreaterThan(30);
  });
});

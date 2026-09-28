import { describe, expect, it } from "vitest";
import { DIRECTIONS } from "../../core/model/direction";
import {
  dropshipBoardingTiles,
  dropshipClearanceFor,
  dropshipFootprint,
} from "./dropship-site-layout";

// ===========================================
// dropshipClearanceFor
// ===========================================

describe("dropshipClearanceFor", () => {
  it.each(DIRECTIONS)(
    "is the clearance whose boarding patch is the square at the corner, facing %s (#1179)",
    (facing) => {
      const patch = { x: 11, z: 17 };
      const clearance = dropshipClearanceFor(patch, facing);
      const boarding = dropshipBoardingTiles(clearance, facing, 3);
      const square = boarding.map((tile) => `${tile.x},${tile.z}`).sort();
      const expected: string[] = [];
      for (let dz = 0; dz < 4; dz++) {
        for (let dx = 0; dx < 4; dx++) {
          expected.push(`${patch.x + dx},${patch.z + dz}`);
        }
      }
      expect(square).toEqual(expected.sort());
      expect(boarding.every((tile) => tile.y === 3)).toBe(true);
      const footprint = dropshipFootprint(clearance, facing);
      expect(
        boarding.some(
          (tile) =>
            tile.x >= footprint.x &&
            tile.x < footprint.x + footprint.w &&
            tile.z >= footprint.z &&
            tile.z < footprint.z + footprint.d,
        ),
      ).toBe(false);
    },
  );
});

import type { Ray, Vector3 } from "three";
import type { Building } from "../../mapgen/model/building";
import { LAYER_HEIGHT, SLAB_HEIGHT } from "../data/mapgen-preview-palette";

/** Clearance above an interior floor and in front of the far shell. */
const DEPTH_CLEARANCE = 0.05;

/**
 * Follows the raw cursor ray down to the floor under the hit surface.
 * Stops just before that footprint rectangle's far wall so inspection
 * retains its shell instead of cutting through another building behind it.
 */
export function buildingInspectionCentre(
  building: Building,
  hit: Vector3,
  ray: Ray,
): Vector3 | undefined {
  const floorHeights = building.floors
    .map((floor) => floor.y * LAYER_HEIGHT + SLAB_HEIGHT)
    .filter((height) => height < hit.y - DEPTH_CLEARANCE);
  if (floorHeights.length === 0 || ray.direction.y >= 0) return undefined;
  const floorY = Math.max(...floorHeights) + DEPTH_CLEARANCE;
  const floorDistance = (floorY - hit.y) / ray.direction.y;
  // Art currently emits rectangular buildings. For a union, retain the
  // containing rectangle's far edge rather than tunnelling across its void.
  const rect = building.footprint.find(
    (r) =>
      hit.x >= r.x - 0.2 &&
      hit.x <= r.x + r.w + 0.2 &&
      hit.z >= r.z - 0.2 &&
      hit.z <= r.z + r.d + 0.2,
  );
  if (!rect) return undefined;
  let distance = floorDistance;
  for (const [value, direction, low, high] of [
    [hit.x, ray.direction.x, rect.x, rect.x + rect.w],
    [hit.z, ray.direction.z, rect.z, rect.z + rect.d],
  ] as const) {
    if (Math.abs(direction) < 1e-8) continue;
    const exit = ((direction > 0 ? high : low) - value) / direction;
    distance = Math.min(distance, exit - DEPTH_CLEARANCE);
  }
  return distance > 0
    ? hit.clone().addScaledVector(ray.direction, distance)
    : undefined;
}

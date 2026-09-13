import type { YawIndex } from "../model/camera-state";
import type { Vec3 } from "../../core/model/grid";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import { footprintSizeOf } from "../../tactical/service/footprint-service";
import { tileTop } from "../view/tactical-map-view";

// ===========================================
// Framing
// ===========================================

/**
 * Where the camera should look when a mission opens (#538): the middle
 * of the force the player just deployed, not the middle of the map.
 *
 * ```
 *   living TDF units? ──► centre of their bounding box, on the ground
 *   none              ──► the map's own centre, as before
 * ```
 *
 * The bounding box rather than the mean, so one unit posted far from the
 * rest pulls the view to include it instead of being averaged away. A
 * deploy zone is a handful of adjacent tiles, so in practice the two
 * agree; they part when a mission starts a unit somewhere else.
 *
 * QA measured four of seven seeds opening with the whole squad off
 * screen, because the map's centre can be tens of tiles from the deploy
 * zone on a large map.
 */
export function missionFocus(mission: TacticalState): Vec3 {
  const force = mission.units.filter((u) => u.team === "tdf" && u.hp > 0);
  return force.length === 0
    ? mapCentre(mission)
    : boundingCentre(force, mission.templates);
}

/**
 * Opens a landing from the boarding side so the aircraft does not hide its force.
 * A force that has left boarding, or an old map without a site, keeps the default view.
 * This chooses the fresh camera's yaw; it never turns a camera during player input.
 */
export function missionArrivalYaw(mission: TacticalState): YawIndex {
  const force = mission.units.filter(
    (unit) => unit.team === "tdf" && unit.hp > 0,
  );
  if (force.length === 0) return 0;
  const site = mission.map.dropships?.find((candidate) => {
    const zone = mission.map.hooks.deployZones.find(
      (hook) => hook.id === candidate.deployZoneId,
    );
    return (
      zone !== undefined &&
      force.every((unit) =>
        zone.tiles.some(
          (tile) =>
            tile.x === unit.pos.x &&
            tile.y === unit.pos.y &&
            tile.z === unit.pos.z,
        ),
      )
    );
  });
  return site?.facing === "s" || site?.facing === "e" ? 2 : 0;
}

/** The ground-plane centre of the map, the fallback when nothing is deployed. */
export function mapCentre(mission: TacticalState): Vec3 {
  return { x: mission.map.width / 2, y: 0, z: mission.map.depth / 2 };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The centre of the units' bounding box, at the height they stand on.
 * Each unit spans its whole footprint (#1130), so the box runs from the
 * anchor's near edge to the far edge of its last tile and a single
 * one-tile unit lands on the middle of its own tile rather than its
 * corner.
 */
function boundingCentre(
  units: readonly Unit[],
  templates: Readonly<Record<string, UnitTemplate>>,
): Vec3 {
  if (units.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let topY = -Infinity;
  for (const unit of units) {
    const size = footprintSizeOf(templates[unit.templateId] ?? {});
    minX = Math.min(minX, unit.pos.x);
    maxX = Math.max(maxX, unit.pos.x + size);
    minZ = Math.min(minZ, unit.pos.z);
    maxZ = Math.max(maxZ, unit.pos.z + size);
    topY = Math.max(topY, tileTop(unit.pos.y));
  }
  return { x: (minX + maxX) / 2, y: topY, z: (minZ + maxZ) / 2 };
}

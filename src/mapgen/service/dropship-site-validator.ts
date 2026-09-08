import { DIRECTIONS } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import { rectContains } from "../../core/service/grid-math";
import { DROPSHIP_SITE_RULES } from "../data/dropship-site";
import { SurfaceIds } from "../data/surfaces";
import { PassMask } from "../model/pass-mask";
import type { TacticalMap } from "../model/tactical-map";
import {
  dropshipBoardingTiles,
  dropshipFootprint,
} from "./dropship-site-layout";
import type { Violation } from "./map-validator";
import type { TileIndex } from "./tile-index";

/** Checks actual final support/clearance, so later passes cannot invalidate a reservation. */
export function validateDropshipSites(
  map: TacticalMap,
  index: TileIndex,
): Violation[] {
  const violations: Violation[] = [];
  const claimed = new Set<number>();
  const zones = new Set<string>();
  for (const site of map.dropships ?? []) {
    const fail = (message: string): void => {
      violations.push({
        invariant: "I6",
        message: `Dropship ${site.deployZoneId}: ${message}`,
      });
    };
    const { clearance, footprint, facing, level } = site;
    if (
      !validRect(clearance, map) ||
      !validRect(footprint, map) ||
      !DIRECTIONS.includes(facing) ||
      !Number.isInteger(level) ||
      level < 0
    ) {
      fail("invalid site bounds, facing or support layer");
      continue;
    }
    const vertical = facing === "n" || facing === "s";
    const rules = DROPSHIP_SITE_RULES;
    if (
      clearance.w !==
        (vertical
          ? rules.width + rules.margin * 2
          : rules.margin + rules.length + rules.boardingSide) ||
      clearance.d !==
        (vertical
          ? rules.margin + rules.length + rules.boardingSide
          : rules.width + rules.margin * 2) ||
      !sameRect(footprint, dropshipFootprint(clearance, facing))
    )
      fail("envelope does not preserve the agreed aircraft and margins");
    const zone = map.hooks.deployZones.find(
      (hook) => hook.id === site.deployZoneId,
    );
    if (zones.has(site.deployZoneId))
      fail("deploy hook is shared by multiple aircraft");
    zones.add(site.deployZoneId);
    const expected = dropshipBoardingTiles(clearance, facing, level).map((p) =>
      index.keyOf(p),
    );
    if (
      !zone ||
      zone.tiles.length !== 16 ||
      new Set(zone.tiles.map((p) => index.keyOf(p))).size !== 16 ||
      !zone.tiles.every((p) => expected.includes(index.keyOf(p)))
    )
      fail(
        "sixteen distinct external boarding columns must meet the rear ramp",
      );
    for (let z = clearance.z; z < clearance.z + clearance.d; z++) {
      for (let x = clearance.x; x < clearance.x + clearance.w; x++) {
        const key = z * map.width + x;
        if (claimed.has(key)) fail("clearance overlaps another site");
        claimed.add(key);
        const column = index.column(x, z);
        const tile = index.getAt({ x, y: level, z });
        if (
          !tile ||
          column.length !== 1 ||
          tile.buildingId !== undefined ||
          tile.surface === SurfaceIds.WATER ||
          tile.surface === SurfaceIds.ROAD ||
          tile.slope !== undefined ||
          tile.propId !== undefined ||
          Object.keys(tile.walls).length > 0
        ) {
          fail(`support/clearance is obstructed at ${x},${level},${z}`);
          continue;
        }
        const hull = rectContains(footprint, x, z);
        if (
          tile.pass !== (hull ? PassMask.NONE : PassMask.ALL) ||
          tile.blocksLos !== hull
        )
          fail(
            `hull or boarding pass/sight mask disagrees at ${x},${level},${z}`,
          );
      }
    }
    if (
      map.connectors.some(
        (c) =>
          rectContains(clearance, c.from.x, c.from.z) ||
          rectContains(clearance, c.to.x, c.to.z),
      )
    )
      fail("a connector enters the reserved support area");
    if (
      zone !== undefined &&
      zone === map.hooks.deployZones[0] &&
      (map.hooks.extraction.tiles.length !== zone.tiles.length ||
        !map.hooks.extraction.tiles.every((p) =>
          expected.includes(index.keyOf(p)),
        ))
    )
      fail("extraction must remain at the first boarding zone");
  }
  return violations;
}

/** Integer, positive-sized rectangle fully inside the map. */
function validRect(rect: Rect, map: TacticalMap): boolean {
  return (
    [rect.x, rect.z, rect.w, rect.d].every(Number.isInteger) &&
    rect.x >= 0 &&
    rect.z >= 0 &&
    rect.w > 0 &&
    rect.d > 0 &&
    rect.x + rect.w <= map.width &&
    rect.z + rect.d <= map.depth
  );
}

/** Exact rectangle equality without depending on object key order. */
function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.z === b.z && a.w === b.w && a.d === b.d;
}

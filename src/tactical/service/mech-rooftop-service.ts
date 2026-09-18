import { STOREY_LAYERS } from "../../core/model/elevation";
import { allows, PassMask } from "../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";

/** Flat, unblocked roofs support a mech delivered by jump jets (ADR 0010). */
export function mechCanOccupyRoof(map: TacticalMap, tile: Tile): boolean {
  if (!tile.buildingId || !allows(tile.pass, PassMask.INFANTRY)) return false;
  const building = map.buildings.find(({ id }) => id === tile.buildingId);
  return (
    building?.roof.kind === "flat" &&
    building.roof.walkable &&
    tile.y === building.groundLevel + building.floors.length * STOREY_LAYERS
  );
}

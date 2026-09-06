import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { RAMP_CONNECTOR_MODEL, surfaceModel } from "../data/map-model-table";
import { ROAD_STYLES } from "../data/road-styles";
import type { RoadAppearance } from "../model/road-appearance";
import { resolveRoadAppearances } from "./road-model-resolver";
import type { ModelPlacement } from "./map-model-resolver";
import { tileTop } from "../view/tactical-map-view";

/**
 * Full-width ramps occupy the lower tile and meet the high terrace at its
 * edge. A centre-to-centre plank buries its upper half inside that terrace.
 * The shared base mesh spans one layer; scaleY fits any connector rise.
 * Existing slope-supported legacy connectors already have materialled art.
 */
export function resolveRampModels(
  map: TacticalMap,
  index: TileIndex,
  roads: ReadonlyMap<number, RoadAppearance> = resolveRoadAppearances(
    map,
    index,
  ),
): readonly ModelPlacement[] {
  const result: ModelPlacement[] = [];
  const feet = new Map<number, number>();
  for (const c of map.connectors)
    if (c.kind === "ramp") {
      const key = index.keyOf(c.from);
      feet.set(key, (feet.get(key) ?? 0) + 1);
    }
  for (const connector of map.connectors) {
    if (connector.kind !== "ramp") continue;
    const low = index.getAt(connector.from),
      high = index.getAt(connector.to);
    if (!low || !high || low.slope || surfaceModel(low.surface) === undefined)
      continue;
    const dx = high.x - low.x,
      dz = high.z - low.z;
    const turns: Rotation = dz > 0 ? 0 : dx < 0 ? 1 : dz < 0 ? 2 : 3;
    const sharedFoot = feet.get(index.keyOf(low))! > 1;
    const road = roads.get(index.keyOf(low));
    const surface = road ? ROAD_STYLES[road.style].surface : low.surface;
    result.push({
      modelId: RAMP_CONNECTOR_MODEL,
      level: high.y,
      // Shared feet start at the centre, leaving room for their other exit.
      position: {
        x: low.x + 0.5 + (sharedFoot ? dx * 0.25 : 0),
        y: tileTop(low.y),
        z: low.z + 0.5 + (sharedFoot ? dz * 0.25 : 0),
      },
      turns,
      scaleY: high.y - low.y,
      scaleZ: sharedFoot ? 0.5 : 1,
      tile: connector.to,
      ramp: {
        id: connector.id,
        from: connector.from,
        surface,
        replacesGround: !sharedFoot,
      },
    });
  }
  return result;
}

import type { PlaceProfileId } from "../../content/model/place-profile-id";
import type { Connector } from "../../mapgen/model/connector";
import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileIndex } from "../../mapgen/service/tile-index";
import {
  LADDER_CONNECTOR_MODEL,
  wallFamilyFor,
  wallModel,
} from "../data/map-model-table";
import { MODEL_MANIFEST } from "../data/model-manifest";
import {
  ladderFinishForWall,
  LADDER_WALL_HALF_THICKNESS,
} from "../data/ladder-styles";
import { LAYER_HEIGHT } from "../data/mapgen-preview-palette";
import { tileTop } from "../view/tactical-map-view";
import type { ModelPlacement } from "./map-model-resolver";

/** Resolves one ladder section per layer, retaining rung spacing at any connector rise. */
export function resolveLadderModels(
  map: TacticalMap,
  index: TileIndex,
  walls: readonly ModelPlacement[],
): readonly ModelPlacement[] {
  const result: ModelPlacement[] = [];
  for (const connector of map.connectors) {
    if (
      connector.kind !== "ladder" ||
      !index.has(connector.from) ||
      !index.has(connector.to)
    )
      continue;
    const { from, to } = connector;
    const dx = to.x - from.x,
      dz = to.z - from.z;
    const turns: Rotation = dz > 0 ? 0 : dx < 0 ? 1 : dz < 0 ? 2 : 3;
    const supportModel = supportingWall(
      connector,
      walls,
      map.recipe.params.placeProfile,
    );
    const finish = ladderFinishForWall(supportModel);
    const setback =
      LADDER_WALL_HALF_THICKNESS +
      MODEL_MANIFEST[LADDER_CONNECTOR_MODEL].footprint.d / 2;
    for (let layer = 0; layer < to.y - from.y; layer++)
      result.push({
        modelId: LADDER_CONNECTOR_MODEL,
        level: to.y,
        position: {
          x: (from.x + to.x + 1) / 2 - dx * setback,
          y: tileTop(from.y + layer),
          z: (from.z + to.z + 1) / 2 - dz * setback,
        },
        turns,
        scaleY: LAYER_HEIGHT / MODEL_MANIFEST[LADDER_CONNECTOR_MODEL].height,
        tile: to,
        ladder: { id: connector.id, finish, supportModel },
      });
  }
  return result;
}

/** Picks the resolved wall crossing the ladder's middle, avoiding the building-id/ground-wall mismatch. */
function supportingWall(
  connector: Connector,
  walls: readonly ModelPlacement[],
  placeProfile?: PlaceProfileId,
): ModelPlacement["modelId"] {
  const { from, to } = connector;
  const x = (from.x + to.x + 1) / 2,
    z = (from.z + to.z + 1) / 2;
  const middle = (tileTop(from.y) + tileTop(to.y)) / 2;
  const support = walls
    .filter(
      (w) =>
        Math.abs(w.position.x - x) < 0.001 &&
        Math.abs(w.position.z - z) < 0.001 &&
        w.position.y <= middle &&
        w.position.y + MODEL_MANIFEST[w.modelId].height > middle,
    )
    .sort((a, b) => b.position.y - a.position.y)[0];
  return (
    support?.modelId ??
    wallModel("solid", wallFamilyFor(connector.buildingId, placeProfile))
  );
}

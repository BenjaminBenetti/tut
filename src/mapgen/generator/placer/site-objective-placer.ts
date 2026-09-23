import { DIRECTIONS } from "../../../core/model/direction";
import { STOREY_LAYERS } from "../../../core/model/elevation";
import { manhattanDistance } from "../../../core/service/grid-math";
import { SurfaceIds } from "../../data/surfaces";
import type { GenerationContext } from "../../model/generation-pass";
import type { HookRequirement } from "../../model/map-recipe";
import { allows } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import { isPassableGround } from "../../service/draft-queries";
import { unreachableInteriorTiles } from "../interior/building-reachability";
import { distanceToDeploy, hookTileKeys } from "./placer-support";

// ===========================================
// Authored objective sockets
// ===========================================

/**
 * Claims site sockets before the ordinary placer fills any remainder. The
 * recipe supplies count, pass mask and metadata, so a site never silently
 * changes the mission rules. Connectivity repairs routes after all hooks.
 */
export function placeSiteObjectives(
  requirement: HookRequirement,
  context: GenerationContext,
): number {
  const { draft } = context;
  const taken = hookTileKeys(draft);
  let placed = 0;
  for (const socket of draft.sites.flatMap((site) => site.objectives)) {
    if (placed >= requirement.count) break;
    if (socket.kind !== requirement.kind) continue;
    const tile = socket.interior
      ? interiorObjectiveTile(socket.tile, requirement, context, taken)
      : draft.groundCoord(socket.tile.x, socket.tile.z);
    if (
      taken.has(draft.tileKey(tile)) ||
      (!socket.interior && !isPassableGround(draft, tile.x, tile.z)) ||
      distanceToDeploy(draft, tile) < (requirement.minDistanceFromDeploy ?? 0)
    )
      continue;
    draft.addHook(
      "objectives",
      requirement.kind,
      [tile],
      requirement.requiredPass,
      requirement.meta,
    );
    taken.add(draft.tileKey(tile));
    placed++;
  }
  return placed;
}

/** Chooses a furnished ground-floor position without letting the objective unit seal any room or roof route. */
function interiorObjectiveTile(
  preferred: TileCoord,
  requirement: HookRequirement,
  { draft, registries }: GenerationContext,
  taken: ReadonlySet<number>,
): TileCoord {
  const buildingId = draft.getTile(preferred)?.buildingId;
  const building = draft.buildings.find((entry) => entry.id === buildingId);
  const entrance = building?.entrances[0];
  if (building && entrance) {
    const connectors = draft.connectors.filter((connector) =>
      building.connectorIds.includes(connector.id),
    );
    const candidates = draft
      .tilesOfBuilding(building.id)
      .filter(
        (tile) =>
          tile.y === building.groundLevel &&
          tile.surface === SurfaceIds.FLOOR &&
          allows(
            registries.surfaces.get(tile.surface).defaultPass,
            requirement.requiredPass,
          ) &&
          draft.propAt(tile) === undefined &&
          !taken.has(draft.tileKey(tile)) &&
          distanceToDeploy(draft, tile) >=
            (requirement.minDistanceFromDeploy ?? 0) &&
          !DIRECTIONS.some(
            (direction) => draft.wallAt(tile, direction) === "door",
          ) &&
          !connectors.some((connector) =>
            [connector.from, connector.to].some(
              (end) => manhattanDistance(tile, end) <= 1,
            ),
          ),
      )
      .sort(
        (a, b) =>
          manhattanDistance(a, preferred) - manhattanDistance(b, preferred) ||
          a.z - b.z ||
          a.x - b.x,
      );
    for (const tile of candidates) {
      const occupied = new Set(taken);
      occupied.add(draft.tileKey(tile));
      if (
        unreachableInteriorTiles(
          draft,
          building.id,
          connectors,
          entrance.tile,
          building.groundLevel + building.floors.length * STOREY_LAYERS,
          occupied,
        ).length === 0
      )
        return { x: tile.x, y: tile.y, z: tile.z };
    }
  }
  throw new Error(
    `No accessible interior socket for "${requirement.kind}" at ${preferred.x},${preferred.z}`,
  );
}

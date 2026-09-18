import { DIRECTIONS } from "../../../core/model/direction";
import { stepGridPos } from "../../../core/service/grid-math";
import type { Building } from "../../model/building";
import type { GenerationContext } from "../../model/generation-pass";
import type { InfestationRuin } from "../../model/infestation-plan";
import type { DraftTile } from "../../model/map-draft";
import { allows, PassMask } from "../../model/pass-mask";
import type { ColumnCoord } from "../../model/road";
import { freezeDraft } from "../../service/draft-freezer";
import { infestationPressure } from "../../service/infestation-layout";
import { ReachabilityService } from "../../service/reachability-service";
import { TileIndex } from "../../service/tile-index";

/** Cuts coherent breaches towards colony districts, leaving usable stairs and rooms. */
export function collapseInfestedBuildings(
  context: GenerationContext,
  protectedColumns: ReadonlySet<number>,
): void {
  const { draft } = context;
  const plan = draft.infestation;
  if (plan === undefined) return;
  const ruins: InfestationRuin[] = [];
  for (let index = 0; index < draft.buildings.length; index++) {
    const building = draft.buildings[index]!;
    const breach = mostInvadedCorner(context, building);
    const pressure = infestationPressure(draft, breach.x, breach.z);
    if (pressure < 0.18) continue;
    const radius = 1.2 + plan.level * 0.28 + pressure * 1.5;
    const ruin = { buildingId: building.id, breach, radius };
    if (!breachWalls(context, building, ruin, protectedColumns)) continue;
    ruins.push(ruin);
    removeUpperSections(context, building, ruin, protectedColumns);
    if (building.roof.kind === "pitched" && !building.roof.walkable) {
      const missingTiles: ColumnCoord[] = [];
      for (const rect of building.footprint)
        for (let z = rect.z; z < rect.z + rect.d; z++)
          for (let x = rect.x; x < rect.x + rect.w; x++)
            if (Math.hypot(x - breach.x, z - breach.z) < radius + 0.7)
              missingTiles.push({ x, z });
      if (missingTiles.length > 0)
        draft.buildings[index] = {
          ...building,
          roof: { ...building.roof, missingTiles },
        };
    }
  }
  draft.infestation = { ...plan, ruins };
}

/** A failure begins on an exposed corner facing the greatest local growth pressure. */
function mostInvadedCorner(
  context: GenerationContext,
  building: Building,
): ColumnCoord {
  const corners = building.footprint.flatMap((rect) => [
    { x: rect.x, z: rect.z },
    { x: rect.x + rect.w - 1, z: rect.z },
    { x: rect.x, z: rect.z + rect.d - 1 },
    { x: rect.x + rect.w - 1, z: rect.z + rect.d - 1 },
  ]);
  return corners.sort(
    (a, b) =>
      infestationPressure(context.draft, b.x, b.z) -
      infestationPressure(context.draft, a.x, a.z),
  )[0]!;
}

/** Opens an eroded section and a ragged low wall along its surviving shoulder. */
function breachWalls(
  { draft }: GenerationContext,
  building: Building,
  ruin: InfestationRuin,
  protectedColumns: ReadonlySet<number>,
): boolean {
  const seen = new Set<string>();
  let changed = false;
  for (const tile of draft.tilesOfBuilding(building.id)) {
    if (protectedColumns.has(tile.z * draft.width + tile.x)) continue;
    const distance = Math.hypot(tile.x - ruin.breach.x, tile.z - ruin.breach.z);
    if (distance > ruin.radius + 1) continue;
    for (const side of DIRECTIONS) {
      const other = stepGridPos(tile, side);
      if (protectedColumns.has(other.z * draft.width + other.x)) continue;
      const wall = draft.wallAt(tile, side);
      if (wall === undefined || wall === "door") continue;
      const key = [draft.tileKey(tile), draft.tileKey(other)]
        .sort((a, b) => a - b)
        .join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      draft.setWall(tile, side, distance < ruin.radius ? undefined : "half");
      changed = true;
    }
  }
  return changed;
}

/** Removes whole upper corner sections only when the surviving building remains reachable. */
function removeUpperSections(
  context: GenerationContext,
  building: Building,
  ruin: InfestationRuin,
  protectedColumns: ReadonlySet<number>,
): void {
  const { draft, params, registries } = context;
  if (params.infestation < 5) return;
  const candidates = draft
    .tilesOfBuilding(building.id)
    .filter(
      (tile) =>
        tile.y > building.groundLevel &&
        !protectedColumns.has(tile.z * draft.width + tile.x) &&
        Math.hypot(tile.x - ruin.breach.x, tile.z - ruin.breach.z) <
          ruin.radius * 0.8,
    );
  if (candidates.length === 0) return;
  const candidateKeys = new Set(candidates.map((tile) => draft.tileKey(tile)));
  const snapshot = freezeDraft(
    draft,
    {
      seed: "ruin-validation",
      params: {
        archetype: params.archetype,
        biome: params.biome.id,
        settlement: params.settlement.id,
        size: { width: draft.width, depth: draft.depth },
        hooks: [],
      },
    },
    registries,
  );
  const tiles = snapshot.tiles.filter(
    (tile) =>
      tile.buildingId === building.id &&
      !candidateKeys.has(draft.tileKey(tile)),
  );
  if (
    building.floors.some(
      (floor) => !tiles.some((tile) => tile.y === floor.y),
    ) ||
    (building.roof.walkable &&
      !tiles.some((tile) => tile.floorIndex === undefined))
  )
    return;
  const index = new TileIndex({ ...snapshot, tiles });
  const own = new Set(building.connectorIds);
  const reach = new ReachabilityService(
    index,
    snapshot.connectors.filter((connector) => own.has(connector.id)),
  );
  const reachable = reach.reachableFrom(
    tiles.filter((tile) => tile.y === building.groundLevel),
    PassMask.INFANTRY,
  );
  if (
    tiles.some(
      (tile) =>
        allows(tile.pass, PassMask.INFANTRY) &&
        !reachable.has(index.keyOf(tile)),
    )
  )
    return;
  removeTiles(context, candidates);
}

/** Removes unsupported furniture and wall edges together with each collapsed slab. */
function removeTiles(
  { draft }: GenerationContext,
  tiles: readonly DraftTile[],
): void {
  for (const tile of tiles) {
    const prop = draft.propAt(tile);
    if (prop !== undefined) draft.removeProp(prop.id);
    for (const side of DIRECTIONS) draft.setWall(tile, side, undefined);
    draft.removeTile(tile);
  }
}

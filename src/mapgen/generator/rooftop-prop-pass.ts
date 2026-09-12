import { STOREY_LAYERS } from "../../core/model/elevation";
import { DIRECTIONS } from "../../core/model/direction";
import { manhattanDistance, stepGridPos } from "../../core/service/grid-math";
import { ROOFTOP_FURNISHING } from "../data/rooftop-furnishing";
import { SurfaceIds } from "../data/surfaces";
import type {
  GenerationContext,
  GenerationPass,
  DraftCapability,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { TileCoord } from "../model/tile-coord";
import { unreachableInteriorTiles } from "./interior/building-reachability";

/** Furnishes real walkable roofs with small service rows, after mission clearances are known. */
export class RooftopPropPass implements GenerationPass {
  readonly id = "rooftop-props";
  readonly requires: readonly DraftCapability[] = [
    "interiors",
    "props",
    "hooks",
  ];
  readonly provides: readonly DraftCapability[] = ["rooftops"];

  /** Retains only complete equipment groups that leave every remaining building tile reachable. */
  run({ draft, rng, registries, diagnostics }: GenerationContext): void {
    const blocked = rooftopClearances(draft);
    let count = 0;
    let roofs = 0;
    for (const building of draft.buildings) {
      const style = ROOFTOP_FURNISHING[building.kind];
      const entrance = building.entrances[0];
      if (!style || !building.roof.walkable || !entrance) continue;
      const y = building.groundLevel + building.floors.length * STOREY_LAYERS;
      const roofTiles = draft
        .tilesOfBuilding(building.id)
        .filter((tile) => tile.y === y && tile.surface === SurfaceIds.ROOF);
      const quota = Math.min(
        style.maxProps,
        Math.floor(roofTiles.length / style.tilesPerProp),
      );
      if (
        quota === 0 ||
        style.props.some((kind) => !registries.props.has(kind))
      )
        continue;
      const candidates = rng.fork(building.id).shuffle(roofTiles);
      const own = draft.connectors.filter((connector) =>
        building.connectorIds.includes(connector.id),
      );
      let finished = false;
      for (let size = quota; size > 0 && !finished; size--) {
        for (const anchor of candidates) {
          // Rows run parallel to the entrance wall, giving the rooftop a coherent service side.
          const alongX = entrance.side === "n" || entrance.side === "s";
          const group = Array.from({ length: size }, (_, i) => ({
            x: anchor.x + (alongX ? i * style.spacing : 0),
            y,
            z: anchor.z + (alongX ? 0 : i * style.spacing),
          }));
          if (
            !group.every((tile) =>
              availableRoofTile(draft, building.id, tile, blocked),
            )
          )
            continue;
          const props = group.map((tile, i) =>
            draft.addProp(
              style.props[i % style.props.length]!,
              tile,
              alongX ? 0 : 1,
            ),
          );
          if (
            unreachableInteriorTiles(draft, building.id, own, entrance.tile, y)
              .length > 0
          ) {
            for (const prop of props) draft.removeProp(prop.id);
            continue;
          }
          count += props.length;
          roofs++;
          finished = true;
          break;
        }
      }
    }
    diagnostics.note(
      `${count} utility props in ${roofs} roof service groups; perimeter and landings clear`,
    );
  }
}

/** Every piece has a full walkable roof apron and stays off the perimeter firing line. */
function availableRoofTile(
  draft: MapDraft,
  buildingId: string,
  coord: TileCoord,
  blocked: ReadonlySet<number>,
): boolean {
  if (!draft.inBounds(coord.x, coord.z)) return false;
  const tile = draft.getTile(coord);
  if (
    tile?.buildingId !== buildingId ||
    tile.surface !== SurfaceIds.ROOF ||
    draft.propAt(coord) ||
    blocked.has(draft.tileKey(coord))
  )
    return false;
  return DIRECTIONS.every((side) => {
    const next = stepGridPos(coord, side);
    if (!draft.inBounds(next.x, next.z)) return false;
    const support = draft.getTile(next);
    return (
      support?.buildingId === buildingId &&
      support.surface === SurfaceIds.ROOF &&
      !draft.propAt(next) &&
      !blocked.has(draft.tileKey(next))
    );
  });
}

/** Protects landings and the complete mission hook/hatch footprints before access repair. */
function rooftopClearances(draft: MapDraft): ReadonlySet<number> {
  const blocked = new Set<number>();
  const hooks = [
    ...draft.hooks.deployZones,
    ...draft.hooks.objectives,
    ...draft.hooks.edgeSpawns,
    ...(draft.hooks.extraction ? [draft.hooks.extraction] : []),
  ];
  const anchors = [
    ...draft.connectors.flatMap((connector) =>
      [connector.from, connector.to].map((tile) => ({ tile, radius: 1 })),
    ),
    ...hooks.flatMap((hook) =>
      hook.tiles.map((tile) => ({
        tile,
        radius:
          typeof hook.meta?.hatchRadius === "number"
            ? hook.meta.hatchRadius
            : 1,
      })),
    ),
  ];
  for (const { tile, radius } of anchors)
    for (let x = tile.x - radius; x <= tile.x + radius; x++)
      for (let z = tile.z - radius; z <= tile.z + radius; z++) {
        const next = { x, y: tile.y, z };
        if (draft.inBounds(x, z) && manhattanDistance(tile, next) <= radius)
          blocked.add(draft.tileKey(next));
      }
  return blocked;
}

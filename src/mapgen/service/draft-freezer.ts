import { CoverLevel } from "../model/cover";
import type { Hook, PlacementHooks } from "../model/hook";
import { HookKinds } from "../model/hook";
import type { DraftTile, MapDraft } from "../model/map-draft";
import type { MapRecipe } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import type { MapGenRegistries } from "../model/registries";
import type { SurfaceId } from "../model/surface";
import type { TacticalMap } from "../model/tactical-map";
import { TACTICAL_MAP_VERSION } from "../model/tactical-map";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";

// ===========================================
// Types
// ===========================================

/** The registries freezing needs. */
export type FreezerRegistries = Pick<MapGenRegistries, "surfaces" | "props">;

/** Building fields a sparse draft tile carries over. */
type TileOwnership = Pick<DraftTile, "buildingId" | "floorIndex" | "roomId">;

// ===========================================
// Freezing
// ===========================================

/**
 * Turns the mutable draft into a plain `TacticalMap` (ADR 0004 §7.3,
 * pass 10). Ground columns that are not covered by a building become
 * ground tiles at their level; every sparse tile becomes a tile as-is;
 * walls, props and cover are looked up per tile; `pass` is denormalised
 * from the surface default, overridden to NONE by a prop.
 *
 * ```
 *   column (x, z) ─► ground tile at groundLevel   unless covered
 *   DraftTile     ─► floor / stairs / roof tile
 *   walls, props  ─► looked up by coordinate
 * ```
 */
export function freezeDraft(
  draft: MapDraft,
  recipe: MapRecipe,
  registries: FreezerRegistries,
): TacticalMap {
  const tiles: Tile[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (draft.isCovered(x, z)) {
        continue;
      }
      tiles.push(
        materialise(
          draft,
          registries,
          draft.groundCoord(x, z),
          draft.groundSurfaceAt(x, z),
          {},
        ),
      );
    }
  }
  for (const sparse of draft.tiles()) {
    tiles.push(materialise(draft, registries, sparse, sparse.surface, sparse));
  }
  return {
    version: TACTICAL_MAP_VERSION,
    recipe,
    width: draft.width,
    depth: draft.depth,
    levels: draft.maxLevel() + 1,
    tiles,
    buildings: [...draft.buildings],
    connectors: [...draft.connectors],
    props: draft.props.map((prop) => ({ ...prop, tile: { ...prop.tile } })),
    hooks: freezeHooks(draft),
  };
}

// ===========================================
// Helpers
// ===========================================

/** Builds one plain tile with pass, walls, prop and cover resolved. */
function materialise(
  draft: MapDraft,
  registries: FreezerRegistries,
  coord: TileCoord,
  surface: SurfaceId,
  ownership: TileOwnership,
): Tile {
  const prop = draft.propAt(coord);
  const definition = registries.surfaces.get(surface);
  const tile: Tile = {
    x: coord.x,
    y: coord.y,
    z: coord.z,
    surface,
    pass: prop === undefined ? definition.defaultPass : PassMask.NONE,
    walls: draft.wallsAt(coord),
    coverProvided:
      prop === undefined
        ? CoverLevel.NONE
        : registries.props.get(prop.kind).cover,
    blocksLos:
      prop === undefined ? false : registries.props.get(prop.kind).blocksLos,
    ...(prop === undefined ? {} : { propId: prop.id }),
    ...(ownership.buildingId === undefined
      ? {}
      : { buildingId: ownership.buildingId }),
    ...(ownership.floorIndex === undefined
      ? {}
      : { floorIndex: ownership.floorIndex }),
    ...(ownership.roomId === undefined ? {} : { roomId: ownership.roomId }),
  };
  return tile;
}

/**
 * Copies the hook groups; a missing extraction defaults to the first
 * deploy zone's tiles so the map is always complete.
 */
function freezeHooks(draft: MapDraft): PlacementHooks {
  const extraction: Hook = draft.hooks.extraction ?? {
    id: draft.ids.nextId("hook"),
    kind: HookKinds.EXTRACTION,
    tiles: draft.hooks.deployZones[0]?.tiles.map((t) => ({ ...t })) ?? [],
    requiredPass: PassMask.ALL,
  };
  return {
    deployZones: [...draft.hooks.deployZones],
    objectives: [...draft.hooks.objectives],
    edgeSpawns: [...draft.hooks.edgeSpawns],
    extraction,
  };
}

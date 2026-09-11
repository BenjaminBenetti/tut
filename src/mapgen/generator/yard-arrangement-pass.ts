import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import {
  directionOffset,
  oppositeDirection,
  rectContains,
  stepGridPos,
} from "../../core/service/grid-math";
import { PropKindIds } from "../data/props";
import { YARD_ARRANGEMENTS } from "../data/yard-arrangements";
import type { KnownBuildingKindId } from "../data/building-kind-ids";
import type { Building } from "../model/building";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { Lot } from "../model/lot";
import type { MapDraft } from "../model/map-draft";
import { PassMask } from "../model/pass-mask";
import type { Rotation } from "../model/prop";
import type { Tile } from "../model/tile";
import type { TileCoord } from "../model/tile-coord";
import type { YardArrangement } from "../model/yard-arrangement";
import { isOpenGround, isPassableGround } from "../service/draft-queries";
import { snapshotDraft, type DraftSnapshot } from "./placer/placer-support";

/** Geometry for one coherent, wall-aligned group with clear space in front. */
interface YardGroup {
  readonly tiles: readonly TileCoord[];
  readonly side: Direction;
}

// ===========================================
// Configuration
// ===========================================

const ROTATION: Readonly<Record<Direction, Rotation>> = {
  s: 0,
  e: 3,
  n: 2,
  w: 1,
};
const CLUTTER: ReadonlySet<string> = new Set([
  PropKindIds.CRATE,
  PropKindIds.SANDBAGS,
  PropKindIds.BARRIER,
]);

// ===========================================
// YardArrangementPass
// ===========================================

/**
 * Replaces urban generic yard clutter with small uses tied to real buildings.
 * Runs after boundaries and hooks, before access repair, preserving the
 * mission placers' original candidate pools and protecting their clearances.
 * Existing low-cover allocation is a ceiling, never a quota to fill. Does not
 * grade/repaint ground, alter vegetation, or touch street/interior props.
 */
export class YardArrangementPass implements GenerationPass {
  readonly id = "yard-arrangements";
  readonly requires: readonly DraftCapability[] = [
    "props",
    "buildings",
    "lots",
    "boundaries",
    "slopes",
    "ramps",
    "hooks",
  ];
  readonly provides: readonly DraftCapability[] = ["yards"];

  /** Replaces only attributed generic yard props; unsupported groups are omitted. */
  run({
    draft,
    params,
    rng,
    registries,
    diagnostics,
  }: GenerationContext): void {
    if (params.settlement.id === "rural") return;
    const clutter = draft.props.filter(
      (prop) => draft.yardPropIds.has(prop.id) && CLUTTER.has(prop.kind),
    );
    if (clutter.length === 0) return;
    for (const prop of clutter) draft.removeProp(prop.id);
    const blocked = protectedGround(draft);
    const snapshot = snapshotDraft(draft, params, registries);
    const occupied = new Set<number>();
    let used = 0;
    let groups = 0;
    for (const building of rng.shuffle(draft.buildings)) {
      const profile = Object.hasOwn(YARD_ARRANGEMENTS, building.kind)
        ? YARD_ARRANGEMENTS[building.kind as KnownBuildingKindId]
        : undefined;
      if (
        !profile ||
        profile.count > clutter.length - used ||
        !registries.props.has(profile.prop)
      )
        continue;
      const lot = draft.lots.find(({ rect }) =>
        building.footprint.every(
          (part) =>
            rectContains(rect, part.x, part.z) &&
            rectContains(rect, part.x + part.w - 1, part.z + part.d - 1),
        ),
      );
      if (!lot) continue;
      const entrance = building.entrances[0];
      if (!entrance) continue;
      const candidates = rng.shuffle(wallGroups(building, profile));
      const frontageRank = (side: Direction): number =>
        side === entrance.side
          ? 2
          : side === oppositeDirection(entrance.side)
            ? 0
            : 1;
      candidates.sort(
        (a, b) =>
          (frontageRank(b.side) - frontageRank(a.side)) *
          (profile.frontage ? 1 : -1),
      );
      const group = candidates.find(
        (candidate) =>
          candidate.tiles.every((tile) =>
            available(draft, lot, tile, candidate.side, blocked),
          ) && preservesLocalRoutes(snapshot, candidate.tiles, occupied),
      );
      if (!group) continue;
      for (const tile of group.tiles) {
        draft.addProp(profile.prop, tile, ROTATION[group.side]);
        occupied.add(draft.tileKey(tile));
        // Other buildings cannot occupy this group's walking/seating apron.
        blocked.add(draft.tileKey(stepGridPos(tile, group.side)));
      }
      used += group.tiles.length;
      groups++;
    }
    diagnostics.note(
      `${used}/${clutter.length} yard props in ${groups} building-use groups; ${clutter.length - used} omitted; fences/vegetation retained`,
    );
  }
}

// ===========================================
// Placement and access
// ===========================================

/** Full groups aligned to an actual footprint wall, one tile outside the building. */
function wallGroups(building: Building, profile: YardArrangement): YardGroup[] {
  const groups: YardGroup[] = [];
  const span = (profile.count - 1) * profile.spacing + 1;
  for (const rect of building.footprint) {
    for (const side of DIRECTIONS) {
      const alongX = side === "n" || side === "s";
      const length = alongX ? rect.w : rect.d;
      for (let start = 0; start + span <= length; start++) {
        const tiles = Array.from({ length: profile.count }, (_, i) => ({
          x: alongX
            ? rect.x + start + i * profile.spacing
            : side === "w"
              ? rect.x - 1
              : rect.x + rect.w,
          y: building.groundLevel,
          z: alongX
            ? side === "n"
              ? rect.z - 1
              : rect.z + rect.d
            : rect.z + start + i * profile.spacing,
        }));
        groups.push({ tiles, side });
      }
    }
  }
  return groups;
}

/** Requires supported lot ground and an open, level apron; never occupies pavement. */
function available(
  draft: MapDraft,
  lot: Lot,
  tile: TileCoord,
  side: Direction,
  blocked: ReadonlySet<number>,
): boolean {
  if (
    !rectContains(lot.rect, tile.x, tile.z) ||
    !isOpenGround(draft, tile.x, tile.z) ||
    draft.groundLevelAt(tile.x, tile.z) !== tile.y ||
    draft.isNaturalEdge(tile.x, tile.z) ||
    blocked.has(draft.tileKey(tile)) ||
    // Keep exterior window firing positions clear for units outside the building.
    draft.wallAt(tile, oppositeDirection(side)) !== "solid"
  )
    return false;
  const front = stepGridPos(tile, side);
  return (
    isPassableGround(draft, front.x, front.z) &&
    draft.groundLevelAt(front.x, front.z) === tile.y &&
    !draft.isNaturalEdge(front.x, front.z) &&
    !blocked.has(draft.tileKey(front)) &&
    draft.wallAt(tile, side) === undefined
  );
}

/** Each approach retains a short path around the whole group for both unit classes. */
function preservesLocalRoutes(
  { index, reach }: DraftSnapshot,
  tiles: readonly TileCoord[],
  occupied: ReadonlySet<number>,
): boolean {
  const removed = new Set([
    ...occupied,
    ...tiles.map((tile) => index.keyOf(tile)),
  ]);
  const minX = Math.min(...tiles.map((tile) => tile.x)) - 1;
  const maxX = Math.max(...tiles.map((tile) => tile.x)) + 1;
  const minZ = Math.min(...tiles.map((tile) => tile.z)) - 1;
  const maxZ = Math.max(...tiles.map((tile) => tile.z)) + 1;
  for (const unitClass of [PassMask.INFANTRY, PassMask.MECH] as const) {
    const neighbours = tiles
      .flatMap((coord) => {
        const tile = index.getAt(coord);
        return tile ? reach.neighbours(tile, unitClass) : [];
      })
      .filter((tile) => !removed.has(index.keyOf(tile)));
    const first = neighbours[0];
    if (!first) return false;
    const seen = new Set([index.keyOf(first)]);
    const queue: Tile[] = [first];
    for (const tile of queue)
      for (const next of reach.neighbours(tile, unitClass)) {
        const key = index.keyOf(next);
        if (
          next.x < minX ||
          next.x > maxX ||
          next.z < minZ ||
          next.z > maxZ ||
          removed.has(key) ||
          seen.has(key)
        )
          continue;
        seen.add(key);
        queue.push(next);
      }
    if (neighbours.some((tile) => !seen.has(index.keyOf(tile)))) return false;
  }
  return true;
}

/** Door, connector and mission clearances stay open before final access repair. */
function protectedGround(draft: MapDraft): Set<number> {
  const blocked = new Set<number>();
  const hooks = [
    ...draft.hooks.deployZones,
    ...draft.hooks.objectives,
    ...draft.hooks.edgeSpawns,
    ...(draft.hooks.extraction ? [draft.hooks.extraction] : []),
  ];
  for (const hook of hooks) {
    const hatchRadius = hook.meta?.hatchRadius;
    const radius = typeof hatchRadius === "number" ? hatchRadius : 1;
    for (const tile of hook.tiles)
      for (let dx = -radius; dx <= radius; dx++)
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > radius) continue;
          const x = tile.x + dx;
          const z = tile.z + dz;
          if (draft.inBounds(x, z))
            blocked.add(draft.tileKey(draft.groundCoord(x, z)));
        }
  }
  for (const building of draft.buildings)
    for (const entrance of building.entrances) {
      const offset = directionOffset(entrance.side);
      for (let distance = 1; distance <= 3; distance++)
        for (let lateral = -1; lateral <= 1; lateral++) {
          const x = entrance.tile.x + offset.x * distance - offset.z * lateral;
          const z = entrance.tile.z + offset.z * distance + offset.x * lateral;
          if (draft.inBounds(x, z))
            blocked.add(draft.tileKey(draft.groundCoord(x, z)));
        }
    }
  for (const connector of draft.connectors) {
    blocked.add(draft.tileKey(connector.from));
    blocked.add(draft.tileKey(connector.to));
  }
  return blocked;
}

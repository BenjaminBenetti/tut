import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import {
  directionOffset,
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
import type { Rotation } from "../model/prop";
import type { TileCoord } from "../model/tile-coord";
import type { YardArrangement } from "../model/yard-arrangement";
import { isOpenGround, isPassableGround } from "../service/draft-queries";

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
 * Runs after boundaries so fences are inputs, before hooks/access repair.
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
      candidates.sort(
        (a, b) =>
          Number((b.side === entrance.side) === profile.frontage) -
          Number((a.side === entrance.side) === profile.frontage),
      );
      const group = candidates.find((candidate) =>
        candidate.tiles.every((tile) =>
          available(draft, lot, tile, candidate.side, blocked),
        ),
      );
      if (!group) continue;
      for (const tile of group.tiles) {
        draft.addProp(profile.prop, tile, ROTATION[group.side]);
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
    blocked.has(draft.tileKey(tile))
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

/** Door approaches and connector landings stay clear before the final access repair. */
function protectedGround(draft: MapDraft): Set<number> {
  const blocked = new Set<number>();
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

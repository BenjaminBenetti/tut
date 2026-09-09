import type { Rng } from "../../core/model/rng";
import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { FENCE_PLACEMENT_TUNING } from "../data/fence-placement-tuning";
import { PropKindIds } from "../data/props";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { Rotation } from "../model/prop";
import type { TileCoord } from "../model/tile-coord";
import { isOpenGround, isRoadAt } from "../service/draft-queries";

// ===========================================
// Boundary candidates
// ===========================================

/** A straight, supported length of an existing plot or trail edge. */
interface BoundaryRun {
  readonly tiles: readonly TileCoord[];
  readonly rotation: Rotation;
  readonly boundary: string;
}

// ===========================================
// BoundaryFencePass
// ===========================================

/**
 * Arranges settlement fence allocations into boundaries (#917, #1006). The prop
 * pass still makes its normal draws, so trees, rocks and yard clutter do
 * not move when fences cease to be isolated, randomly rotated points.
 * Runs follow existing plot edges or trails, never a random field shape.
 * No terrain is graded, and no extra panels are added to meet a quota.
 */
export class BoundaryFencePass implements GenerationPass {
  /** Keep the shipped RNG stream so the accepted rural layouts do not reroll. */
  readonly id = "rural-fences";
  readonly requires: readonly DraftCapability[] = [
    "props",
    "roads",
    "lots",
    "buildings",
    "slopes",
    "ramps",
    "kerbs",
  ];
  readonly provides: readonly DraftCapability[] = ["boundaries"];

  /** Relocates panels after slope classification, before access repairs. */
  run({ draft, rng, diagnostics }: GenerationContext): void {
    const fences = draft.props.filter((p) => p.kind === PropKindIds.FENCE);
    if (fences.length === 0) return;
    for (const fence of fences) draft.removeProp(fence.id);
    const blocked = protectedColumns(draft);
    const available = (tile: TileCoord): boolean =>
      supportedGround(draft, tile) && !blocked.has(draft.tileKey(tile));
    const candidates = rng.shuffle(boundaryRuns(draft, available));
    const { minRun, maxRun, opening } = FENCE_PLACEMENT_TUNING;
    const used = new Map<string, number>();
    let placed = 0;
    let runs = 0;
    while (fences.length - placed >= minRun) {
      // Share runs between plots and the trail before extending one yard.
      candidates.sort(
        (a, b) =>
          (used.get(a.boundary) ?? 0) - (used.get(b.boundary) ?? 0) ||
          Math.min(maxRun, b.tiles.length) - Math.min(maxRun, a.tiles.length),
      );
      let fitted = false;
      for (const candidate of candidates) {
        const remaining = fences.length - placed;
        if (remaining < minRun) break;
        const tiles = fitRun(candidate, remaining, available, rng);
        if (tiles === undefined) continue;
        for (const tile of tiles) {
          draft.addProp(PropKindIds.FENCE, tile, candidate.rotation);
          for (let dz = -opening; dz <= opening; dz++) {
            for (let dx = -opening; dx <= opening; dx++) {
              if (!draft.inBounds(tile.x + dx, tile.z + dz)) continue;
              blocked.add(
                draft.tileKey(draft.groundCoord(tile.x + dx, tile.z + dz)),
              );
            }
          }
        }
        placed += tiles.length;
        runs++;
        used.set(candidate.boundary, (used.get(candidate.boundary) ?? 0) + 1);
        fitted = true;
        break;
      }
      if (!fitted) break;
    }
    diagnostics.note(
      `${placed}/${fences.length} fence panels in ${runs} boundary runs; ` +
        `${fences.length - placed} omitted where no supported run fits`,
    );
  }
}

/** Fits the longest available part of a boundary without leaving a singleton quota. */
function fitRun(
  candidate: BoundaryRun,
  remaining: number,
  available: (tile: TileCoord) => boolean,
  rng: Rng,
): readonly TileCoord[] | undefined {
  const { minRun, maxRun } = FENCE_PLACEMENT_TUNING;
  for (
    let length = Math.min(remaining, maxRun, candidate.tiles.length);
    length >= minRun;
    length--
  ) {
    const left = remaining - length;
    if (left > 0 && left < minRun) continue;
    const starts = rng.shuffle(
      Array.from({ length: candidate.tiles.length - length + 1 }, (_, i) => i),
    );
    for (const start of starts) {
      const tiles = candidate.tiles.slice(start, start + length);
      if (tiles.every(available)) return tiles;
    }
  }
  return undefined;
}

// ===========================================
// Ground and access
// ===========================================

/** Protects door approaches and existing connector landings. */
function protectedColumns(draft: MapDraft): Set<number> {
  const blocked = new Set<number>();
  for (const building of draft.buildings) {
    for (const entrance of building.entrances) {
      const outside = stepGridPos(entrance.tile, entrance.side);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!draft.inBounds(outside.x + dx, outside.z + dz)) continue;
          blocked.add(
            draft.tileKey(draft.groundCoord(outside.x + dx, outside.z + dz)),
          );
        }
      }
    }
  }
  for (const c of draft.connectors) {
    blocked.add(draft.tileKey(c.from));
    blocked.add(draft.tileKey(c.to));
  }
  return blocked;
}

/** Rejects occupied ground, walls and every potential slope, including corners. */
function supportedGround(draft: MapDraft, tile: TileCoord): boolean {
  if (!isOpenGround(draft, tile.x, tile.z)) return false;
  // The marker is independent of slopeShare; a visual knob must not reroll fences.
  if (draft.isNaturalEdge(tile.x, tile.z)) return false;
  if (Object.keys(draft.wallsAt(tile)).length > 0) return false;
  return DIRECTIONS.every((direction) => {
    const next = stepGridPos(tile, direction);
    return (
      draft.inBounds(next.x, next.z) &&
      draft.groundLevelAt(next.x, next.z) <= tile.y
    );
  });
}

// ===========================================
// Existing land use
// ===========================================

/** Splits actual plot/trail edges at obstructions and changes of grade. */
function boundaryRuns(
  draft: MapDraft,
  available: (tile: TileCoord) => boolean,
): BoundaryRun[] {
  const runs: BoundaryRun[] = [];
  const append = (
    columns: readonly { x: number; z: number }[],
    rotation: Rotation,
    boundary: string,
    belongs: (tile: TileCoord) => boolean = () => true,
  ): void => {
    let tiles: TileCoord[] = [];
    const finish = (): void => {
      if (tiles.length >= FENCE_PLACEMENT_TUNING.minRun)
        runs.push({ tiles, rotation, boundary });
      tiles = [];
    };
    for (const column of columns) {
      const tile = draft.groundCoord(column.x, column.z);
      if (!available(tile) || !belongs(tile)) {
        finish();
        continue;
      }
      if (tiles.length > 0 && tiles[0]!.y !== tile.y) finish();
      tiles.push(tile);
    }
    finish();
  };
  for (const { id, rect } of draft.lots) {
    for (
      let offset = 0;
      offset <= FENCE_PLACEMENT_TUNING.yardOffset;
      offset++
    ) {
      for (const z of [rect.z - offset, rect.z + rect.d - 1 + offset]) {
        if (z <= 0 || z >= draft.depth - 1) continue;
        append(
          Array.from({ length: rect.w }, (_, i) => ({ x: rect.x + i, z })),
          0,
          id,
        );
      }
      for (const x of [rect.x - offset, rect.x + rect.w - 1 + offset]) {
        if (x <= 0 || x >= draft.width - 1) continue;
        append(
          Array.from({ length: rect.d }, (_, i) => ({ x, z: rect.z + i })),
          1,
          id,
        );
      }
    }
  }
  for (const rotation of [0, 1] as const) {
    const width = rotation === 0 ? draft.width : draft.depth;
    const depth = rotation === 0 ? draft.depth : draft.width;
    for (let row = 1; row < depth - 1; row++) {
      const columns = Array.from({ length: width - 2 }, (_, i) =>
        rotation === 0 ? { x: i + 1, z: row } : { x: row, z: i + 1 },
      );
      for (const side of [-1, 1]) {
        const dx = rotation === 0 ? 0 : side;
        const dz = rotation === 0 ? side : 0;
        for (
          let offset = FENCE_PLACEMENT_TUNING.trailOffset;
          offset <= FENCE_PLACEMENT_TUNING.maxTrailOffset;
          offset++
        ) {
          append(
            columns,
            rotation,
            "trail",
            (tile) =>
              isRoadAt(draft, tile.x + dx * offset, tile.z + dz * offset) &&
              Array.from({ length: offset - 1 }, (_, i) => i + 1).every(
                (step) =>
                  isOpenGround(draft, tile.x + dx * step, tile.z + dz * step),
              ),
          );
        }
      }
    }
  }
  return runs;
}

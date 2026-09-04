import type { Direction } from "../../../core/model/direction";
import { DIRECTIONS } from "../../../core/model/direction";
import {
  manhattanDistance,
  oppositeDirection,
  stepGridPos,
} from "../../../core/service/grid-math";
import { SurfaceIds } from "../../data/surfaces";
import type { GenerationContext } from "../../model/generation-pass";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { MapDraft } from "../../model/map-draft";
import type { HookRequirement } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import type { WallKind } from "../../model/wall";
import {
  isBoundaryColumn,
  isOpenGround,
  isPassableGround,
} from "../../service/draft-queries";
import {
  distanceToDeploy,
  hatchSpace,
  hookTileKeys,
  reachableFromDeploy,
  snapshotDraft,
} from "./placer-support";

// ===========================================
// Constants
// ===========================================

/** Minimum manhattan distance between two spawners. */
const MIN_SPREAD = 6;

/** Share of spawners placed indoors when interiors are available. */
const INTERIOR_SHARE = 0.5;

/** Default hatch radius written into `meta` when the recipe gives none. */
const DEFAULT_HATCH_RADIUS = 3;

/**
 * Fewest infantry-reachable tiles a spawner needs within its hatch radius
 * (itself included) so hatched bugs have somewhere to stand. The
 * connectivity pass only adds passability, so the count holds on the
 * final map.
 */
export const HATCH_SPACE_MIN = 6;

/**
 * How far the placer looks for somewhere a spawner could be shot from
 * (#544). It only has to be an upper bound on where a shooter stands;
 * the longest weapon in the game today reaches ten tiles.
 */
export const FIRING_LINE_RANGE = 10;

/** A candidate tile and whether it is inside a building. */
interface Candidate {
  readonly coord: TileCoord;
  readonly interior: boolean;
}

// ===========================================
// EggSpawnerPlacer
// ===========================================

/**
 * Places egg spawners (GDD §6.3): point hooks at least
 * `minDistanceFromDeploy` from any deploy tile, spread at least
 * `MIN_SPREAD` apart, half of them inside buildings when interiors exist,
 * with at least `HATCH_SPACE_MIN` infantry-reachable tiles within the
 * hatch radius (checked in draw order, only as far as needed), preferring
 * tiles infantry can already reach. The rest of the map's open ground is
 * the fallback so the count is always met.
 */
export class EggSpawnerPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.EGG_SPAWNER;
  readonly priority = 10;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` spawner hooks to the objectives. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const snapshot = snapshotDraft(draft, params, registries);
    const reachable = reachableFromDeploy(draft, snapshot, PassMask.INFANTRY);
    // A firing position is only one if a mech can walk to it (#544); the
    // guard in #489 asks for exactly that, per class.
    const mechCanStand = reachableFromDeploy(draft, snapshot, PassMask.MECH);
    const radius = hatchRadiusOf(requirement);
    const minDistance = requirement.minDistanceFromDeploy ?? 0;
    const taken = hookTileKeys(draft);
    const all = collectCandidates(draft).filter(
      (c) =>
        !taken.has(draft.tileKey(c.coord)) &&
        distanceToDeploy(draft, c.coord) >= minDistance,
    );
    const preferred = all.filter((c) => reachable(c.coord));
    const pool = preferred.length >= requirement.count ? preferred : all;
    const roomy = (c: Candidate): boolean =>
      hatchSpace(snapshot, c.coord, radius, PassMask.INFANTRY) >=
      HATCH_SPACE_MIN;
    if (pool.length === 0) {
      diagnostics.note("no candidate tiles for egg spawners");
      return;
    }
    const placed: TileCoord[] = [];
    let remaining = rng.shuffle(pool);
    for (let i = 0; i < requirement.count; i++) {
      if (remaining.length === 0) {
        remaining = rng.shuffle(
          pool.filter((c) => !placed.some((p) => sameColumn(p, c.coord))),
        );
        if (remaining.length === 0) {
          break;
        }
      }
      const wantInterior = i < Math.ceil(requirement.count * INTERIOR_SHARE);
      const interior = remaining.filter((c) => c.interior);
      const ordered =
        wantInterior && interior.length > 0 ? interior : remaining;
      // Both checks are measured lazily, in draw order, so only a handful
      // of candidates per map are walked; a cramped pool falls back to
      // hatch space alone and then to its head, so the count is still met.
      const shootable = (c: Candidate): boolean =>
        hasFiringLine(draft, c.coord, mechCanStand);
      // A spawner with thin hatch space still works, just quietly; one
      // nothing can shoot cannot be destroyed at all, so a firing line
      // outranks hatch space when a map cannot give both — and a map
      // whose rooms are all blind gives the spawner up to the open air
      // rather than hiding it somewhere unbeatable.
      const pick =
        ordered.find((c) => roomy(c) && shootable(c)) ??
        ordered.find(shootable) ??
        remaining.find((c) => !c.interior && roomy(c) && shootable(c)) ??
        remaining.find((c) => !c.interior && shootable(c)) ??
        ordered.find(roomy) ??
        ordered[0];
      if (pick === undefined) {
        break;
      }
      placed.push(pick.coord);
      draft.addHook(
        "objectives",
        HookKinds.EGG_SPAWNER,
        [pick.coord],
        requirement.requiredPass,
        {
          hatchRadius: radius,
          ...requirement.meta,
        },
      );
      remaining = remaining.filter(
        (c) => manhattanDistance(c.coord, pick.coord) >= MIN_SPREAD,
      );
    }
    diagnostics.note(
      `${placed.length}/${requirement.count} egg spawners, ` +
        `${placed.filter((p) => draft.getTile(p) !== undefined).length} indoors`,
    );
  }
}

// ===========================================
// Helpers
// ===========================================

/** Interior floor tiles and open ground away from the map edge. */
function collectCandidates(draft: MapDraft): Candidate[] {
  const candidates: Candidate[] = [];
  for (const tile of draft.tiles()) {
    if (
      tile.surface === SurfaceIds.FLOOR &&
      draft.propAt(tile) === undefined &&
      !hasDoor(draft, tile) &&
      !isEntrance(draft, tile)
    ) {
      candidates.push({
        coord: { x: tile.x, y: tile.y, z: tile.z },
        interior: true,
      });
    }
  }
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (isOpenGround(draft, x, z) && !isBoundaryColumn(draft, x, z)) {
        candidates.push({ coord: draft.groundCoord(x, z), interior: false });
      }
    }
  }
  return candidates;
}

/** True when any edge of the tile holds a door. */
function hasDoor(draft: MapDraft, tile: TileCoord): boolean {
  return DIRECTIONS.some(
    (direction) => draft.wallAt(tile, direction) === "door",
  );
}

/** True when the tile is a building entrance. */
function isEntrance(draft: MapDraft, tile: TileCoord): boolean {
  return draft.buildings.some((b) =>
    b.entrances.some(
      (e) => e.tile.x === tile.x && e.tile.y === tile.y && e.tile.z === tile.z,
    ),
  );
}

/** The recipe's hatch radius, or the default when it gives none. */
function hatchRadiusOf(requirement: HookRequirement): number {
  const radius = requirement.meta?.hatchRadius;
  return typeof radius === "number" ? radius : DEFAULT_HATCH_RADIUS;
}

/** Column equality. */
function sameColumn(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.z === b.z && a.y === b.y;
}

/**
 * True when something standing outside could shoot this tile (#544).
 * Exported for its own test; the placer uses it as a preference.
 *
 * The general sight rule is tactical's and mapgen must not reach for it,
 * but the placer does not need the general case: along one of the four
 * axes the sight line degenerates to walking the row, and a straight run
 * that ends on outdoor ground is a line any rule would agree on. Finding
 * one is enough; failing to find one only makes a candidate less
 * attractive, never illegal.
 *
 * ```
 *   E │ . . ▓ →    E spawner, │ window, ▓ outdoor ground it can be shot
 *     wall           from. A solid or door wall, or a prop that blocks
 *                    sight, ends the walk in that direction.
 * ```
 */
export function hasFiringLine(
  draft: MapDraft,
  from: TileCoord,
  mechCanStand: (coord: TileCoord) => boolean,
): boolean {
  return DIRECTIONS.some((direction) =>
    raySeesOutside(draft, from, direction, mechCanStand),
  );
}

/** Walks one direction from the tile looking for open ground with a clear line. */
function raySeesOutside(
  draft: MapDraft,
  from: TileCoord,
  direction: Direction,
  mechCanStand: (coord: TileCoord) => boolean,
): boolean {
  let at = from;
  for (let step = 0; step < FIRING_LINE_RANGE; step++) {
    const next = stepGridPos(at, direction);
    if (blocksSight(draft.wallAt(at, direction))) {
      return false;
    }
    if (!draft.inBounds(next.x, next.z)) {
      return false;
    }
    if (blocksSight(draft.wallAt(next, oppositeDirection(direction)))) {
      return false;
    }
    const tile = draft.getTile(next);
    if (tile === undefined) {
      // No interior tile here: the run has reached the outside, and the
      // ground is a firing position when a mech could walk to it and
      // stand there.
      const ground = draft.groundCoord(next.x, next.z);
      return (
        ground.y === from.y &&
        isPassableGround(draft, next.x, next.z) &&
        mechCanStand(ground)
      );
    }
    if (draft.propAt(next) !== undefined) {
      return false;
    }
    at = next;
  }
  return false;
}

/** Solid walls and doors stop a line; windows do not, and nor does no wall. */
function blocksSight(kind: WallKind | undefined): boolean {
  return kind === "solid" || kind === "door";
}

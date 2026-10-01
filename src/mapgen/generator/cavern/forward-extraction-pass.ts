import type { CavernChamber, CavernLayout } from "../../model/cavern-layout";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../../model/generation-pass";
import type { Hook } from "../../model/hook";
import { HookKinds } from "../../model/hook";
import type { ForwardExtractionTuning } from "../../model/hive-cavern-tuning";
import type { MapDraft } from "../../model/map-draft";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import { isOpenGround } from "../../service/draft-queries";
import type { DraftSnapshot } from "../placer/placer-support";
import { hookTileKeys, snapshotDraft } from "../placer/placer-support";

// ===========================================
// Types
// ===========================================

/** A square the zone could fill, and how well it sits. */
interface Candidate {
  readonly tiles: readonly TileCoord[];
  readonly chamber: CavernChamber;
  /** A mech's steps from the zone's nearest tile to the core's pad. */
  readonly toCore: number;
  /** A mech's steps from the zone's nearest tile to the landing zone. */
  readonly toDeploy: number;
  /** Lower is better: off the target share, plus any detour off the route, plus the heart's penalty. */
  readonly score: number;
}

/** A mech's steps from a set of tiles, by snapshot tile key; absent where none lead. */
type WalkField = ReadonlyMap<number, number>;

// ===========================================
// ForwardExtractionPass
// ===========================================

/**
 * Marks a Great Hive's forward extraction point (#1179 C3a round 3): a
 * second place to board, on the route past halfway in, so the walk home
 * from the core is `coreShare` of the walk in (three-eighths on a Great
 * Hive). One `forward-extraction` hook in the objectives group, a level
 * square the size of the landing zone.
 *
 * ```
 *   mouth ══ route ══ route ══ route ══[FWD]══ route ══ core
 *   landing zone ◄────── toDeploy ──────►◄──── toCore ────►
 *                       toCore ≈ coreShare × (landing zone to core)
 * ```
 *
 * Distances are a mech's walk on the draft as it stands, frozen once
 * (the §5 rule every placer uses). The square is chosen, with no draw,
 * as the one whose nearest tile is nearest `coreShare` of the landing
 * zone's walk from the core, plus any detour it takes off the way
 * between them, plus `heartPenalty` steps when it reaches into the
 * heart where the chamber's brood sleeps; ties go to scan order. Every
 * tile of it is open, level floor in one route chamber with no prop on
 * it, no other hook's tile, and clear of the nests' hatching ground, as
 * a landing pad is clear. A cavern with no such square gets no hook,
 * and its mission extracts at the mouth alone.
 *
 * Not a hook placer: the brood chambers and the core must be marked
 * first, and the recipe never requests the kind, so I8 never counts it.
 * The hook is `PassMask.ALL`, so the connectivity pass after this one
 * guarantees a mech can reach it (I7).
 */
export class ForwardExtractionPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "forward-extraction";
  readonly requires: readonly DraftCapability[] = ["cavern", "hooks"];
  readonly provides: readonly DraftCapability[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param tuning - Where the point goes and how big it is. */
  constructor(private readonly tuning: ForwardExtractionTuning) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds the forward extraction hook, or notes why the cavern has none. */
  run(context: GenerationContext): void {
    const { draft, diagnostics } = context;
    const layout = draft.cavern;
    const deploy = draft.hooks.deployZones[0];
    const core = draft.hooks.objectives.find(
      (hook) => hook.kind === HookKinds.HIVE_CORE,
    );
    if (layout === undefined || deploy === undefined || core === undefined) {
      diagnostics.note("no cavern, landing zone or core: no forward point");
      return;
    }
    const snapshot = snapshotDraft(draft, context.params, context.registries);
    const fromDeploy = walkField(snapshot, deploy.tiles);
    const fromCore = walkField(snapshot, core.tiles);
    const whole = nearest(snapshot, fromCore, deploy.tiles);
    if (whole === undefined) {
      diagnostics.note("a mech cannot walk to the core: no forward point");
      return;
    }
    const best = bestSquare(draft, layout, this.tuning, {
      snapshot,
      fromDeploy,
      fromCore,
      whole,
    });
    if (best === undefined) {
      diagnostics.note("no square fits a forward point");
      return;
    }
    draft.addHook(
      "objectives",
      HookKinds.FORWARD_EXTRACTION,
      best.tiles,
      PassMask.ALL,
      { chamberId: best.chamber.id },
    );
    diagnostics.note(
      `forward point in ${best.chamber.id}: ${String(best.toCore)} of ${String(whole)} steps from the core`,
    );
  }
}

// ===========================================
// The mech's walk
// ===========================================

/** A mech's steps from the nearest of `sources`, by snapshot tile key. */
function walkField(
  snapshot: DraftSnapshot,
  sources: readonly TileCoord[],
): WalkField {
  const { index, reach } = snapshot;
  const field = new Map<number, number>();
  const queue = sources.flatMap((source) => {
    const tile = index.getAt(source);
    if (tile === undefined || (tile.pass & PassMask.MECH) === 0) return [];
    const key = index.keyOf(tile);
    if (field.has(key)) return [];
    field.set(key, 0);
    return [tile];
  });
  // Pushing while iterating is the queue: array iterators see appended tiles.
  for (const tile of queue) {
    const next = (field.get(index.keyOf(tile)) ?? 0) + 1;
    for (const neighbour of reach.neighbours(tile, PassMask.MECH)) {
      const key = index.keyOf(neighbour);
      if (field.has(key)) continue;
      field.set(key, next);
      queue.push(neighbour);
    }
  }
  return field;
}

/** The fewest steps `field` gives any of `tiles`; undefined when it gives none. */
function nearest(
  snapshot: DraftSnapshot,
  field: WalkField,
  tiles: readonly TileCoord[],
): number | undefined {
  let best: number | undefined;
  for (const tile of tiles) {
    const steps = field.get(snapshot.index.keyOf(tile));
    if (steps !== undefined && (best === undefined || steps < best)) {
      best = steps;
    }
  }
  return best;
}

// ===========================================
// Choosing the square
// ===========================================

/** What the choice reads: the frozen draft, both walks and the whole way. */
interface Walks {
  readonly snapshot: DraftSnapshot;
  readonly fromDeploy: WalkField;
  readonly fromCore: WalkField;
  /** A mech's steps from the landing zone to the core. */
  readonly whole: number;
}

/**
 * The best square for the zone (see `ForwardExtractionPass`), or
 * undefined when none fits. Scans anchors in row order and keeps the
 * first of equal scores.
 */
function bestSquare(
  draft: MapDraft,
  layout: CavernLayout,
  tuning: ForwardExtractionTuning,
  walks: Walks,
): Candidate | undefined {
  const taken = hookTileKeys(draft);
  const hearts = heartsOf(draft.hooks.objectives);
  const nests = draft.hooks.objectives
    .filter((hook) => hook.kind === HookKinds.EGG_SPAWNER)
    .flatMap((hook) => hook.tiles);
  const target = tuning.coreShare * walks.whole;
  let best: Candidate | undefined;
  for (let z = 0; z + tuning.size <= draft.depth; z++) {
    for (let x = 0; x + tuning.size <= draft.width; x++) {
      const chamber =
        layout.chambers[layout.chamberOf[z * draft.width + x] ?? -1];
      if (chamber?.role !== "route") continue;
      const tiles = squareAt(draft, layout, walks, chamber, x, z, tuning.size);
      if (tiles === undefined) continue;
      if (tiles.some((tile) => taken.has(draft.tileKey(tile)))) continue;
      if (nearNest(tiles, nests, tuning.nestClearance)) continue;
      const toCore = nearest(walks.snapshot, walks.fromCore, tiles) ?? 0;
      const toDeploy = nearest(walks.snapshot, walks.fromDeploy, tiles) ?? 0;
      const detour = Math.max(0, toCore + toDeploy - walks.whole);
      const heart = nearHeart(tiles, hearts.get(chamber.id), chamber, tuning)
        ? tuning.heartPenalty
        : 0;
      const score = Math.abs(toCore - target) + detour + heart;
      if (best === undefined || score < best.score) {
        best = { tiles, chamber, toCore, toDeploy, score };
      }
    }
  }
  return best;
}

/**
 * The `size` × `size` square of ground tiles anchored at `(x, z)`, or
 * undefined unless every column of it is open floor of `chamber` with
 * no prop on it (`isOpenGround`), all on one level, and both walks reach
 * at least one of its tiles.
 */
function squareAt(
  draft: MapDraft,
  layout: CavernLayout,
  walks: Walks,
  chamber: CavernChamber,
  x: number,
  z: number,
  size: number,
): readonly TileCoord[] | undefined {
  const { index } = walks.snapshot;
  const tiles: TileCoord[] = [];
  let reached = false;
  for (let dz = 0; dz < size; dz++) {
    for (let dx = 0; dx < size; dx++) {
      const column = (z + dz) * draft.width + (x + dx);
      const coord = draft.groundCoord(x + dx, z + dz);
      if (
        layout.open[column] !== 1 ||
        layout.chamberOf[column] !== chamber.index ||
        (tiles.length > 0 && coord.y !== tiles[0]?.y) ||
        !isOpenGround(draft, coord.x, coord.z)
      ) {
        return undefined;
      }
      const key = index.keyOf(coord);
      reached ||= walks.fromCore.has(key) && walks.fromDeploy.has(key);
      tiles.push(coord);
    }
  }
  return reached ? tiles : undefined;
}

/**
 * Whether any of `tiles` lies within the heart's clearance of the
 * chamber's brood tile: `heartClearanceShare` of its radius, and never
 * under `minHeartClearance`.
 */
function nearHeart(
  tiles: readonly TileCoord[],
  heart: TileCoord | undefined,
  chamber: CavernChamber,
  tuning: ForwardExtractionTuning,
): boolean {
  if (heart === undefined) return false;
  const clearance = Math.max(
    tuning.minHeartClearance,
    tuning.heartClearanceShare * chamber.radius,
  );
  return tiles.some(
    (tile) => Math.hypot(tile.x - heart.x, tile.z - heart.z) < clearance,
  );
}

/** Whether any of `tiles` is within `clearance` columns (Chebyshev) of a nest. */
function nearNest(
  tiles: readonly TileCoord[],
  nests: readonly TileCoord[],
  clearance: number,
): boolean {
  return tiles.some((tile) =>
    nests.some(
      (nest) =>
        Math.max(Math.abs(tile.x - nest.x), Math.abs(tile.z - nest.z)) <=
        clearance,
    ),
  );
}

/** Each chamber's brood tile, by chamber id: where its heart is centred. */
function heartsOf(objectives: readonly Hook[]): ReadonlyMap<string, TileCoord> {
  const hearts = new Map<string, TileCoord>();
  for (const hook of objectives) {
    const chamberId = hook.meta?.chamberId;
    const tile = hook.tiles[0];
    if (
      hook.kind === HookKinds.BROOD_CHAMBER &&
      typeof chamberId === "string" &&
      tile !== undefined
    ) {
      hearts.set(chamberId, tile);
    }
  }
  return hearts;
}

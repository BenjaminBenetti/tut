import type { Rng } from "../../../core/model/rng";
import { manhattanDistance } from "../../../core/service/grid-math";
import type { GenerationContext } from "../../model/generation-pass";
import { HookKinds } from "../../model/hook";
import type { HookPlacer } from "../../model/hook-placer";
import type { MapDraft } from "../../model/map-draft";
import type { HookRequirement } from "../../model/map-recipe";
import { PassMask } from "../../model/pass-mask";
import type { TileCoord } from "../../model/tile-coord";
import {
  isBoundaryColumn,
  isPassableGround,
} from "../../service/draft-queries";
import {
  distanceToDeploy,
  hookTileKeys,
  reachableFromDeploy,
  snapshotDraft,
} from "./placer-support";

// ===========================================
// Constants
// ===========================================

/** Zone size along the edge. */
const ZONE_MIN = 4;
const ZONE_MAX = 6;

/** How far zones keep from each other and from any deploy tile. */
interface SpacingRule {
  readonly gap: number;
  readonly minDistanceFromDeploy: number;
}

/**
 * Spacing tried in order: the strict rule first, then progressively
 * looser ones only for zones the strict pass could not fit, so a map
 * the resolver accepts always meets its count and a map that fits the
 * strict rule draws exactly the same sequence as before.
 */
const SPACING_RULES: readonly SpacingRule[] = [
  { gap: 8, minDistanceFromDeploy: 12 },
  { gap: 4, minDistanceFromDeploy: 12 },
  { gap: 4, minDistanceFromDeploy: 6 },
  { gap: 2, minDistanceFromDeploy: 0 },
];

/**
 * A slice of the candidates, sorted farthest from deploy first, that one
 * zone's seed is drawn from. Fractions of the list, not distances, so a
 * band means the same thing on every map size.
 */
interface SeedBand {
  readonly from: number;
  readonly to: number;
}

/**
 * The band each zone draws from, by the order zones are placed and then
 * cycling. The first zone keeps the farthest third it has always used —
 * the slow pressure source that arrives late in a long mission — and the
 * second takes the middle third, so one wave flanks while the mission is
 * still live (#433). Bugs walk two actions a turn (swarmer 14 tiles,
 * brute 6), and on a medium map the far third sits 63 steps from deploy
 * at the median against about 40 for the middle third.
 */
const SEED_BANDS: readonly SeedBand[] = [
  { from: 0, to: 1 / 3 },
  { from: 1 / 3, to: 2 / 3 },
];

/** Fallback band covering every candidate; only an empty `SEED_BANDS` uses it. */
const WHOLE_RANGE: SeedBand = { from: 0, to: 1 };

// ===========================================
// EdgeSpawnPlacer
// ===========================================

/**
 * Places edge spawn zones (GDD §6.3): short runs of boundary tiles well
 * away from the deploy zones, on passable ground, preferring tiles bugs
 * can walk from into the map. Zones sit on different stretches of edge
 * and at different distances — the first far out, the next about half as
 * far — so the waves that walk out of them do not all arrive together
 * (#433). On a map too small for that, the spacing relaxes step by step
 * until the count is met.
 *
 * ```
 *   SSSSS.............      far band, the late pressure
 *   .................
 *   ......SSSSS......S      middle band, the flank that lands in time
 *   ...............DDD
 * ```
 */
export class EdgeSpawnPlacer implements HookPlacer {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = HookKinds.EDGE_SPAWN;
  readonly priority = 10;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Adds `count` zones to the edge spawns. */
  place(requirement: HookRequirement, context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const reachable = reachableFromDeploy(
      draft,
      snapshotDraft(draft, params, registries),
      PassMask.INFANTRY,
    );
    let placed = 0;
    for (const [index, rule] of SPACING_RULES.entries()) {
      if (placed >= requirement.count) {
        break;
      }
      if (index > 0) {
        diagnostics.note(
          `edge spawn spacing relaxed to gap ${rule.gap}, ` +
            `deploy distance ${rule.minDistanceFromDeploy}`,
        );
      }
      placed += placeZones(
        draft,
        requirement,
        rule,
        reachable,
        rng,
        requirement.count - placed,
      );
    }
    diagnostics.note(`${placed}/${requirement.count} edge spawn zones`);
  }
}

// ===========================================
// Placement
// ===========================================

/**
 * Places up to `wanted` zones under one spacing rule, keeping clear of
 * every hook tile already on the draft; returns how many were placed.
 */
function placeZones(
  draft: MapDraft,
  requirement: HookRequirement,
  rule: SpacingRule,
  reachable: (coord: TileCoord) => boolean,
  rng: Rng,
  wanted: number,
): number {
  const minDistance = Math.max(
    rule.minDistanceFromDeploy,
    requirement.minDistanceFromDeploy ?? 0,
  );
  const existing = draft.hooks.edgeSpawns.flatMap((zone) => zone.tiles);
  let candidates = boundaryCandidates(
    draft,
    hookTileKeys(draft),
    minDistance,
  ).filter((c) => existing.every((t) => manhattanDistance(t, c) >= rule.gap));
  const preferred = candidates.filter(reachable);
  if (preferred.length >= ZONE_MIN) {
    candidates = preferred;
  }
  let placed = 0;
  for (let i = 0; i < wanted; i++) {
    if (candidates.length === 0) {
      break;
    }
    const seed = pickSeed(draft, candidates, rng, bandFor(draft));
    const size = rng.nextInt(ZONE_MIN, ZONE_MAX);
    const tiles = growAlongEdge(draft, seed, size, candidates);
    draft.addHook(
      "edgeSpawns",
      HookKinds.EDGE_SPAWN,
      tiles,
      requirement.requiredPass,
      requirement.meta,
    );
    placed++;
    candidates = candidates.filter((c) =>
      tiles.every((t) => manhattanDistance(t, c) >= rule.gap),
    );
  }
  return placed;
}

// ===========================================
// Helpers
// ===========================================

/** Passable boundary ground at least `minDistance` from the deploy zones. */
function boundaryCandidates(
  draft: MapDraft,
  taken: ReadonlySet<number>,
  minDistance: number,
): TileCoord[] {
  const out: TileCoord[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (!isBoundaryColumn(draft, x, z) || !isPassableGround(draft, x, z)) {
        continue;
      }
      const coord = draft.groundCoord(x, z);
      if (
        !taken.has(draft.tileKey(coord)) &&
        distanceToDeploy(draft, coord) >= minDistance
      ) {
        out.push(coord);
      }
    }
  }
  return out;
}

/**
 * The band the next zone draws from: the bands cycle in order, so zone 1
 * is far, zone 2 middle, zone 3 far again.
 */
function bandFor(draft: MapDraft): SeedBand {
  const band = SEED_BANDS[draft.hooks.edgeSpawns.length % SEED_BANDS.length];
  return band ?? WHOLE_RANGE;
}

/**
 * A random candidate inside the band, measured on the candidates sorted
 * farthest from the deploy zones first. Draws exactly one number from the
 * rng however wide the band is, and never returns nothing: a band that
 * rounds to empty falls back to its first candidate.
 */
function pickSeed(
  draft: MapDraft,
  candidates: readonly TileCoord[],
  rng: Rng,
  band: SeedBand,
): TileCoord {
  const sorted = [...candidates].sort(
    (a, b) => distanceToDeploy(draft, b) - distanceToDeploy(draft, a),
  );
  const start = Math.min(
    Math.floor(sorted.length * band.from),
    sorted.length - 1,
  );
  const end = Math.max(start + 1, Math.ceil(sorted.length * band.to));
  return rng.pick(sorted.slice(start, end));
}

/**
 * Walks the boundary both ways from the seed collecting candidate tiles
 * until the zone reaches `size` or the edge runs out of candidates.
 */
function growAlongEdge(
  draft: MapDraft,
  seed: TileCoord,
  size: number,
  candidates: readonly TileCoord[],
): TileCoord[] {
  const keys = new Set(candidates.map((c) => draft.tileKey(c)));
  const alongX = seed.z === 0 || seed.z === draft.depth - 1;
  const tiles: TileCoord[] = [seed];
  for (const step of [1, -1]) {
    for (let offset = 1; tiles.length < size; offset++) {
      const x = alongX ? seed.x + step * offset : seed.x;
      const z = alongX ? seed.z : seed.z + step * offset;
      if (!draft.inBounds(x, z)) {
        break;
      }
      const coord = draft.groundCoord(x, z);
      if (!keys.has(draft.tileKey(coord))) {
        break;
      }
      tiles.push(coord);
    }
  }
  return tiles;
}

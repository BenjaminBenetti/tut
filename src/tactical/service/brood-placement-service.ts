import type { Rng } from "../../core/model/rng";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { SpeciesMix } from "../../bugs/model/species-mix";
import type { Hook } from "../../mapgen/model/hook";
import { allHooks, HookKinds } from "../../mapgen/model/hook";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { ReachabilitySnapshot } from "../../mapgen/service/hatch-space";
import { snapshotMap } from "../../mapgen/service/hatch-space";
import type { Brood, BroodId, BroodWakeZone } from "../model/brood";
import { DEFAULT_BROOD_RADIUS } from "../model/brood";
import type { BroodSetupDeps, BroodTuning } from "../model/brood-tuning";
import type { BugUnitSource } from "../model/bug-unit-source";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { coordOf, firstTile } from "./missions/map-placement";
import type { PlacedBugDeps } from "./placed-bug-service";
import { placeBugsAt } from "./placed-bug-service";
import { withinWakeZone } from "./brood-wake-service";

// ===========================================
// Types
// ===========================================

/** One brood to stand: who, where, and the zone that wakes it. */
export interface DormantBroodSpec {
  /** The brood the bugs join; a second call with the same id adds to it. */
  readonly broodId: BroodId;
  /** The stat block every bug of this call is built from. */
  readonly species: BugUnitSource;
  /** Footprint anchors, in the order to try them (`placeBugsAt`). */
  readonly positions: readonly TileCoord[];
  /** The zone that wakes the brood; kept from the first call for an id. */
  readonly wake: BroodWakeZone;
  /** Where it sleeps, for the log; kept from the first call for an id. */
  readonly label?: string;
}

/**
 * What `placeCavernBroods` reads: ids, and the brood content. A
 * `MissionSetupDeps` is one, so a setup rule passes its own deps.
 */
export interface CavernBroodDeps extends PlacedBugDeps {
  /** Species and tuning; absent, no brood is placed. */
  readonly broods?: BroodSetupDeps;
}

// ===========================================
// Constants
// ===========================================

/** The label every cavern brood's RNG stream forks from the mission seed. */
export const BROOD_RNG_LABEL = "dormant-broods";

/**
 * Candidate tiles drawn per bug a brood should hold: the spares stand
 * in for tiles a unit, a spawner or a block's footprint turns out to
 * need, so a brood is not short for want of a second try.
 */
export const BROOD_CANDIDATE_SLACK = 3;

/** Compass points by octant, counter-clockwise from east, for a chamber's label. */
const COMPASS: readonly string[] = [
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
  "south",
  "south-east",
];

// ===========================================
// One brood
// ===========================================

/**
 * Stands a dormant brood (#1179, campaign arc §7.5): one bug of
 * `species` on each position that can hold it, through the shared
 * placement path (`placeBugsAt`, ADR 0013 §2.6), each with the
 * `dormant` status, and records them as a brood that wakes together.
 *
 * ```
 *   placeBugsAt(state, species, positions) ──► the new units
 *       each + status "dormant"
 *   broods[broodId] exists? ──► its memberIds += the new ids
 *                  else     ──► broods += { id, wake, label, memberIds }
 * ```
 *
 * A brood of mixed species is several calls with one id. Nothing is
 * rolled; ids come from `deps` in position order. Pure.
 *
 * @param state - The mission so far.
 * @param spec - The brood, its species, its positions and its wake zone.
 * @param deps - The id generator.
 * @returns `state` itself when no position could hold a bug, else the mission with the brood.
 */
export function placeDormantBrood(
  state: TacticalState,
  spec: DormantBroodSpec,
  deps: PlacedBugDeps,
): TacticalState {
  const placed = placeBugsAt(state, spec.species, spec.positions, deps);
  if (placed === state) {
    return state;
  }
  const newcomers = new Set(
    placed.units.slice(state.units.length).map((unit) => unit.id),
  );
  const units = placed.units.map((unit): Unit =>
    newcomers.has(unit.id)
      ? { ...unit, status: [...unit.status, "dormant"] }
      : unit,
  );
  const broods = state.broods ?? [];
  const existing = broods.find((brood) => brood.id === spec.broodId);
  const joined: readonly Brood[] =
    existing === undefined
      ? [
          ...broods,
          {
            id: spec.broodId,
            wake: {
              centre: coordOf(spec.wake.centre),
              radius: spec.wake.radius,
            },
            memberIds: [...newcomers],
            ...(spec.label === undefined ? {} : { label: spec.label }),
          },
        ]
      : broods.map((brood) =>
          brood === existing
            ? { ...brood, memberIds: [...brood.memberIds, ...newcomers] }
            : brood,
        );
  return { ...placed, units, broods: joined };
}

// ===========================================
// Positions
// ===========================================

/**
 * Up to `count` tiles a brood of the chamber may sleep on, in a random
 * order: tiles an infantry-sized bug can stand on, reachable on foot
 * from the hook's tile without leaving the wake zone (so a brood never
 * sleeps behind the chamber's wall, in the tunnel next door), and not on
 * any hook's tile — deploy zone, spawner, extraction, the chamber hook
 * itself — so it never takes a place something else was promised.
 *
 * ```
 *   BFS from the hook tile over infantry steps,
 *     keeping tiles with dx² + dz² ≤ radius²  ──► hook tiles removed
 *                                            ──► rng.shuffle, first count
 * ```
 *
 * The radius is the hook's `meta.radius` (`DEFAULT_BROOD_RADIUS` when
 * absent). Units are not known here; `placeBugsAt` skips a tile a unit
 * or spawner turns out to hold.
 *
 * @param map - The generated map.
 * @param hook - A `brood-chamber` hook.
 * @param count - How many tiles at most.
 * @param rng - The stream the order is drawn from (one shuffle).
 * @returns Distinct tiles, fewer than `count` when the chamber is small.
 */
export function broodPositions(
  map: TacticalMap,
  hook: Hook,
  count: number,
  rng: Rng,
): TileCoord[] {
  const snapshot = snapshotMap(map);
  return chamberTiles(snapshot, hook, hookTileKeys(map, snapshot), count, rng);
}

// ===========================================
// A cavern's broods
// ===========================================

/**
 * Stands one dormant brood in every `brood-chamber` hook of the map
 * (#1179, campaign arc §7.5): the one-line seam a hive cavern's setup
 * rule calls. A no-op without `deps.broods`, and on a map with no
 * chamber hooks.
 *
 * ```
 *   rng = Mulberry32(state.seed).fork("dormant-broods")
 *   for hook of brood-chamber hooks (map order):
 *     hookRng = rng.fork(hook.id)
 *     size    = broodSize(role, difficulty, tuning)
 *     species ~ state.bugMix, else tuning.defaultMix   (hookRng "species", one pick per bug)
 *     tiles   = broodPositions(size × slack)            (hookRng "positions")
 *     placeDormantBrood per species, in first-rolled order,
 *       id brood-<chamberId>, wake { hook tile, meta.radius }, label "<compass> chamber"
 * ```
 *
 * Seeded from the mission, so the same mission always sleeps the same
 * broods in the same places; forked per hook, so one chamber's roll
 * never moves another's.
 *
 * @param state - The mission so far (deployment and objectives placed).
 * @param map - The generated cavern.
 * @param deps - Ids, and the brood species and tuning.
 * @returns The mission with its broods, or `state` itself when none could be placed.
 */
export function placeCavernBroods(
  state: TacticalState,
  map: TacticalMap,
  deps: CavernBroodDeps,
): TacticalState {
  const content = deps.broods;
  const hooks = map.hooks.objectives.filter(
    (hook) => hook.kind === HookKinds.BROOD_CHAMBER,
  );
  if (content === undefined || hooks.length === 0) {
    return state;
  }
  const snapshot = snapshotMap(map);
  const reserved = hookTileKeys(map, snapshot);
  const rng = new Mulberry32Rng(state.seed).fork(BROOD_RNG_LABEL);
  let mission = state;
  for (const hook of hooks) {
    const hookRng = rng.fork(hook.id);
    const size = broodSize(hook, mission.difficulty, content.tuning);
    const slots = rollSpecies(
      size,
      content.species,
      mission.bugMix,
      content.tuning,
      hookRng.fork("species"),
    );
    if (slots.length === 0) {
      continue;
    }
    const candidates = chamberTiles(
      snapshot,
      hook,
      reserved,
      size * BROOD_CANDIDATE_SLACK,
      hookRng.fork("positions"),
    );
    const brood = {
      broodId: broodIdOf(hook),
      wake: { centre: firstTile(hook), radius: broodRadiusOf(hook) },
      label: chamberLabel(hook, map),
    };
    let cursor = 0;
    for (const [species, wanted] of groupBySpecies(slots)) {
      let missing = wanted;
      while (missing > 0 && cursor < candidates.length) {
        const positions = candidates.slice(cursor, cursor + missing);
        cursor += positions.length;
        const before = mission.units.length;
        mission = placeDormantBrood(
          mission,
          { ...brood, species, positions },
          deps,
        );
        missing -= mission.units.length - before;
      }
    }
  }
  return mission;
}

/**
 * How many bugs sleep in a chamber: the tuning's base plus its step per
 * difficulty, scaled by the chamber's role and clamped.
 *
 * @param hook - The `brood-chamber` hook; its `meta.role` picks the scale.
 * @param difficulty - The mission's difficulty.
 * @param tuning - The brood tuning.
 * @returns A whole number of bugs in `[minSize, maxSize]`.
 */
export function broodSize(
  hook: Hook,
  difficulty: number,
  tuning: BroodTuning,
): number {
  const role = hook.meta?.role;
  const scale = typeof role === "string" ? (tuning.roleScale[role] ?? 1) : 1;
  const raw = Math.round(
    (tuning.baseSize + tuning.sizePerDifficulty * difficulty) * scale,
  );
  return Math.min(tuning.maxSize, Math.max(tuning.minSize, raw));
}

// ===========================================
// Helpers
// ===========================================

/** `brood-<chamberId>`, or `brood-<hook id>` for a hook without a chamber id. */
function broodIdOf(hook: Hook): BroodId {
  const chamber = hook.meta?.chamberId;
  return `brood-${typeof chamber === "string" ? chamber : hook.id}`;
}

/** The hook's `meta.radius`, or `DEFAULT_BROOD_RADIUS` when it is missing or not positive. */
function broodRadiusOf(hook: Hook): number {
  const radius = hook.meta?.radius;
  return typeof radius === "number" && radius > 0
    ? radius
    : DEFAULT_BROOD_RADIUS;
}

/** Keys of every hook's tiles: the places a brood must leave free. */
function hookTileKeys(
  map: TacticalMap,
  snapshot: ReachabilitySnapshot,
): ReadonlySet<number> {
  const keys = new Set<number>();
  for (const hook of allHooks(map.hooks)) {
    for (const tile of hook.tiles) {
      if (snapshot.index.inBounds(tile)) {
        keys.add(snapshot.index.keyOf(tile));
      }
    }
  }
  return keys;
}

/** The chamber's free standable tiles (see `broodPositions`), shuffled, the first `count`. */
function chamberTiles(
  snapshot: ReachabilitySnapshot,
  hook: Hook,
  reserved: ReadonlySet<number>,
  count: number,
  rng: Rng,
): TileCoord[] {
  const { index, reach } = snapshot;
  const origin = firstTile(hook);
  const start = index.getAt(origin);
  if (start === undefined || !reach.canOccupy(start, PassMask.INFANTRY)) {
    return [];
  }
  const zone = { centre: origin, radius: broodRadiusOf(hook) };
  const seen = new Set<number>([index.keyOf(start)]);
  const queue = [start];
  // Pushing while iterating is the queue: array iterators see appended tiles.
  for (const tile of queue) {
    for (const next of reach.neighbours(tile, PassMask.INFANTRY)) {
      const key = index.keyOf(next);
      if (seen.has(key) || !withinWakeZone(zone, next)) {
        continue;
      }
      seen.add(key);
      queue.push(next);
    }
  }
  const free = queue
    .filter(
      (tile) =>
        !reserved.has(index.keyOf(tile)) &&
        reach.canOccupy(tile, PassMask.INFANTRY),
    )
    .map(coordOf);
  return rng.shuffle(free).slice(0, Math.max(0, count));
}

/**
 * One species per bug of the brood, drawn by the mission's frozen mix
 * over the species on offer, else by the tuning's default mix. Empty
 * when neither names a species on offer.
 */
function rollSpecies(
  size: number,
  species: readonly BugUnitSource[],
  bugMix: SpeciesMix | undefined,
  tuning: BroodTuning,
  rng: Rng,
): readonly BugUnitSource[] {
  const rollable = bugMix === undefined ? [] : weighted(species, bugMix);
  const pool =
    rollable.length > 0 ? rollable : weighted(species, tuning.defaultMix);
  if (pool.length === 0) {
    return [];
  }
  const slots: BugUnitSource[] = [];
  for (let i = 0; i < size; i++) {
    slots.push(rng.pickWeighted(pool, (entry) => entry.weight).source);
  }
  return slots;
}

/** The species the mix gives a positive weight, with that weight. */
function weighted(
  species: readonly BugUnitSource[],
  mix: SpeciesMix,
): readonly { source: BugUnitSource; weight: number }[] {
  return species
    .map((source) => {
      const weight: unknown = (mix as Readonly<Record<string, unknown>>)[
        source.id
      ];
      return {
        source,
        weight:
          typeof weight === "number" && Number.isFinite(weight) ? weight : 0,
      };
    })
    .filter((entry) => entry.weight > 0);
}

/** The slots counted per species, in the order each species was first rolled. */
function groupBySpecies(
  slots: readonly BugUnitSource[],
): Map<BugUnitSource, number> {
  const groups = new Map<BugUnitSource, number>();
  for (const source of slots) {
    groups.set(source, (groups.get(source) ?? 0) + 1);
  }
  return groups;
}

/**
 * Where the chamber lies from the map's centre, for the log: a compass
 * point (north is −z, east is +x) or "central", then the kind of
 * chamber — `"east chamber"`, `"north-west side chamber"`, and
 * `"core chamber"` for the deepest, which needs no direction.
 */
function chamberLabel(hook: Hook, map: TacticalMap): string {
  const role = hook.meta?.role;
  if (role === "core") {
    return "core chamber";
  }
  const kind = role === "side" ? "side chamber" : "chamber";
  const tile = firstTile(hook);
  const dx = tile.x - map.width / 2;
  const dz = tile.z - map.depth / 2;
  if (Math.hypot(dx, dz) < Math.min(map.width, map.depth) / 6) {
    return `central ${kind}`;
  }
  const octant = Math.round(Math.atan2(-dz, dx) / (Math.PI / 4));
  return `${COMPASS[(octant + 8) % 8] ?? "central"} ${kind}`;
}

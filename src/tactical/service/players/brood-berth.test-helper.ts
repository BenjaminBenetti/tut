import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { BROOD_TUNING } from "../../data/brood-tuning";
import { DEFAULT_BROOD_RADIUS } from "../../model/brood";
import type { Unit } from "../../model/unit";
import { isDormant, passMaskFor } from "../../model/unit";
import type { MoveGraph, TileKey } from "../movement-service";
import { fieldAvoiding } from "./player-navigation.test-helper";
import type { MoveOption, Reach } from "./player-navigation.test-helper";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// Letting sleeping broods lie (#1179, campaign arc §7.5)
// ===========================================
//
// A hive cavern's broods sleep in their chambers until something walks
// into the chamber, shoots into it, or makes a loud noise near it; then
// the whole brood wakes at once. A player sees the sleepers on the
// screen and gives them a wide berth: it does not count them as contact,
// does not shoot them, walks round their chambers where the cavern
// allows, and keeps its loud guns quiet near them.
//
//   view ──► sleepers       dormant bugs in sight
//        ──► awakeView      the view with only the awake bugs as enemies
//        ──► sleeperGround  tiles within BERTH of a sleeper (all levels),
//                           shrunk to just inside a unit already within it
//        ──► berthField     the field to the goals round that ground
//        ──► crossesGround  whether a walk passes through it
//        ──► wakesSleepers  whether a shot or a throw would be heard or land among them
//
// A unit that finds itself inside a berth (a sleeper seen late) keeps
// what distance it has: its berth shrinks to just inside it (`berthOf`).

/**
 * Flat distance from a sleeper inside which a player does not walk: a
 * brood wakes when anything steps within its chamber's radius (6 by
 * default) of the chamber's middle, and its members lie about the
 * middle, so a berth this wide from each one keeps clear of the zone.
 */
export const SLEEPER_BERTH = 8;

/**
 * Flat distance from a sleeper inside which a shot or a blast landing
 * wakes its brood: a chamber's radius, which its members lie inside.
 */
export const SLEEPER_ZONE = DEFAULT_BROOD_RADIUS;

/**
 * Flat distance from a sleeper inside which a player keeps its loud
 * guns quiet: a mech's shot, a heavy gun or a blast wakes a brood from
 * its radius plus the noise radius, and one more for the members that
 * lie off the chamber's middle.
 */
export const SLEEPER_EARSHOT =
  DEFAULT_BROOD_RADIUS + BROOD_TUNING.wake.noiseRadius + 1;

/** Berth fields kept before the oldest is dropped. */
const BERTH_CACHE_SIZE = 16;

/** Cached berth fields by graph, then by sleepers, class and goals. */
const BERTH_FIELDS = new WeakMap<
  MoveGraph,
  Map<string, ReadonlyMap<TileKey, number>>
>();

/** The dormant bugs the side can see. */
export function sleepers(view: PlayerView): readonly Unit[] {
  return view.enemies.filter(isDormant);
}

/** The view with only the awake bugs as enemies: sleepers are not contact. */
export function awakeView(view: PlayerView): PlayerView {
  const awake = view.enemies.filter((enemy) => !isDormant(enemy));
  return awake.length === view.enemies.length
    ? view
    : { ...view, enemies: awake };
}

/**
 * Tile keys within `SLEEPER_BERTH` (flat) of a sleeper in sight, on
 * every level, except those within the same berth of one of `goals`:
 * the ground round a goal is walked whatever sleeps there, since the
 * goal is the point. Seen from `from`, a unit already inside a berth,
 * that berth shrinks to just inside the unit: it may step away or
 * round the sleeper, never nearer.
 *
 * ```
 *   · · · · · · ·      s  a sleeper, u a unit already inside its berth
 *   · ░ ░ ░ ░ ░ ·      ░  the ground as `u` sees it: nearer s than u is
 *   · ░ ░ s ░ ░ u
 *   · ░ ░ ░ ░ ░ ·
 * ```
 */
export function sleeperGround(
  view: PlayerView,
  goals: readonly TileCoord[] = [],
  from?: TileCoord,
): ReadonlySet<TileKey> {
  const ground = new Set<TileKey>();
  const index = view.graph.index;
  const near = (tile: TileCoord, anchors: readonly TileCoord[]): boolean =>
    anchors.some((anchor) => flat(tile, anchor) <= SLEEPER_BERTH);
  for (const sleeper of sleepers(view)) {
    const berth = berthOf(sleeper, from);
    const span = Math.floor(Math.sqrt(Math.max(0, berth)));
    for (let dx = -span; dx <= span; dx++) {
      for (let dz = -span; dz <= span; dz++) {
        if (dx * dx + dz * dz > berth) continue;
        for (const tile of index.column(
          sleeper.pos.x + dx,
          sleeper.pos.z + dz,
        )) {
          if (!near(tile, goals)) ground.add(index.keyOf(tile));
        }
      }
    }
  }
  return ground;
}

/**
 * The field to `goals` for `unit` that never enters sleeper ground as
 * the unit sees it (`sleeperGround` from where it stands), or undefined
 * when no sleeper is in sight or the unit cannot reach a goal without
 * entering it (then the plain field serves, and the brood on the only
 * way through is the price of the goal). Cached per graph on the
 * sleepers in sight with their berths, the unit's class and the goals.
 */
export function berthField(
  view: PlayerView,
  unit: Unit,
  goals: readonly TileCoord[],
): ReadonlyMap<TileKey, number> | undefined {
  const asleep = sleepers(view);
  if (asleep.length === 0 || goals.length === 0) return undefined;
  const index = view.graph.index;
  const mask = passMaskFor(unit.passClass);
  const cacheKey = [
    String(mask),
    asleep
      .map(
        (sleeper) =>
          `${String(index.keyOf(sleeper.pos))}:${String(berthOf(sleeper, unit.pos))}`,
      )
      .sort()
      .join(","),
    goals
      .map((goal) => index.keyOf(goal))
      .sort((a, b) => a - b)
      .join(","),
  ].join("|");
  let cache = BERTH_FIELDS.get(view.graph);
  if (cache === undefined) {
    cache = new Map();
    BERTH_FIELDS.set(view.graph, cache);
  }
  let field = cache.get(cacheKey);
  if (field === undefined) {
    field = fieldAvoiding(
      view.graph,
      goals,
      mask,
      sleeperGround(view, goals, unit.pos),
    );
    if (cache.size >= BERTH_CACHE_SIZE) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(cacheKey, field);
  }
  return field.has(index.keyOf(unit.pos)) ? field : undefined;
}

/**
 * Whether the walk to `option` (along the search's cheapest route)
 * steps on a tile of `ground`: a brood wakes on any step that ends in
 * its zone, not only the last.
 */
export function crossesGround(
  unit: Unit,
  reach: Reach,
  option: MoveOption,
  ground: ReadonlySet<TileKey>,
  graph: MoveGraph,
): boolean {
  if (ground.size === 0) return false;
  const origin = graph.index.keyOf(unit.pos);
  let key: TileKey | undefined = option.key;
  while (key !== undefined && key !== origin) {
    if (ground.has(key)) return true;
    key = reach.search.parents.get(key);
  }
  return false;
}

/**
 * Whether `unit` firing `weaponId` would be heard: every mech gun, and
 * a gun of the heavy machine gun's armour penetration or more.
 */
export function isLoudShot(
  view: PlayerView,
  unit: Unit,
  weaponId: string,
): boolean {
  if (unit.kind === "mech") return true;
  const weapon = view.mission.templates[unit.templateId]?.weapons.find(
    (candidate) => candidate.id === weaponId,
  );
  return (weapon?.profile.armorPen ?? 0) >= BROOD_TUNING.wake.heavyArmorPen;
}

/**
 * Whether a shot or throw would wake a brood in sight: a loud one fired
 * within earshot of a sleeper, or any landing within `SLEEPER_ZONE` of
 * one.
 */
export function wakesSleepers(
  view: PlayerView,
  from: TileCoord,
  at: TileCoord,
  loud: boolean,
): boolean {
  const asleep = sleepers(view);
  if (asleep.length === 0) return false;
  return asleep.some(
    (sleeper) =>
      flat(sleeper.pos, at) <= SLEEPER_ZONE ||
      (loud && flat(sleeper.pos, from) <= SLEEPER_EARSHOT),
  );
}

// ===========================================
// Private
// ===========================================

/**
 * The squared berth kept from `sleeper`: `SLEEPER_BERTH` squared, or for
 * a unit at `from` already inside it, every tile nearer the sleeper than
 * the unit, so the unit may step round or away but never nearer. Squared
 * so that "nearer" is exact on the grid.
 */
function berthOf(sleeper: Unit, from: TileCoord | undefined): number {
  const whole = SLEEPER_BERTH * SLEEPER_BERTH;
  if (from === undefined) return whole;
  const dx = from.x - sleeper.pos.x;
  const dz = from.z - sleeper.pos.z;
  return Math.min(whole, dx * dx + dz * dz - 1);
}

/** Euclidean distance on the ground plane. */
function flat(a: TileCoord, b: TileCoord): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

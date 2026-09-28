import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { BROOD_TUNING } from "../../data/brood-tuning";
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
// A hive cavern's broods sleep round their chambers' middles until
// something walks into the wake zone, shoots into it, or makes a loud
// noise near it; then the whole brood wakes at once. The zone is not
// drawn on the screen, so a player reads it off the sleepers: the bugs
// lying together are one brood, its zone is the round they lie in and a
// little more. It does not count them as contact, does not shoot them,
// walks round their zones where the cavern allows, keeps its loud guns
// quiet near them, and in a cavern where broods sleep does not walk
// onto ground it has not seen.
//
//   view ──► sleepers       dormant bugs in sight, and those seen asleep
//                           and lost to sight since, where they lay
//        ──► awakeView      the view with only the awake bugs as enemies
//        ──► readBroods     sleepers within BROOD_LINK of each other are one
//                           brood: the round of their middle, BROOD_MARGIN wider
//        ──► sleeperGround  every read brood's round, and SLEEPER_BERTH round
//                           each sleeper (all levels), shrunk to just inside
//                           a unit already within one
//        ──► berthField     the field to the goals round that ground
//        ──► crossesGround  whether a walk passes through it
//        ──► crossesUnseen  whether a walk passes over ground never seen
//        ──► wakesSleepers  whether a shot or a throw would be heard or land among them
//
//          · · · · · · · · ·      s  sleepers of one brood; c their middle
//          · · ░ ░ ░ ░ ░ · ·      ░  the brood's round as read: the farthest
//          · ░ ░ s ░ s ░ ░ ·         sleeper from c, BROOD_MARGIN wider,
//          · ░ s ░ c ░ ░ s ·         and SLEEPER_BERTH round each sleeper
//          · ░ ░ ░ s ░ s ░ ·
//          · · ░ ░ ░ ░ ░ · ·
//
// A unit that finds itself inside a round (a brood seen late) keeps what
// distance it has: that round shrinks to just inside it (`shrunkTo`).

/** A brood as a player reads it off the screen: the round its sleepers lie in. */
export interface ReadBrood {
  /** The middle of the brood's sleepers in sight, on the ground plane. */
  readonly centre: { readonly x: number; readonly z: number };
  /** Flat distance from `centre` the brood's wake zone is read to reach. */
  readonly radius: number;
}

/**
 * Flat distance between two sleepers within which a player reads them
 * as one brood: a brood lies packed round its chamber's middle, and the
 * next chamber's lies a tunnel away.
 */
export const BROOD_LINK = 6;

/**
 * Tiles past its farthest sleeper from their middle that a player reads
 * a brood's wake zone to reach: the zone's edge lies a little beyond the
 * outermost sleeper, and the middle of those in sight is off the
 * chamber's by a tile or so.
 */
export const BROOD_MARGIN = 2;

/**
 * Flat distance from each sleeper inside which a player does not walk:
 * the berth that covers a brood only partly in sight, whose middle and
 * spread are not yet known.
 */
export const SLEEPER_BERTH = 3;

/**
 * Flat distance from a goal within which its ground is walked whatever
 * sleeps there: the goal is the point.
 */
export const GOAL_GROUND = 8;

/**
 * Tiles a player adds to a brood's read round and the noise radius when
 * it judges whether a loud gun would be heard.
 */
const EARSHOT_SLACK = 1;

/** How much nearer than a unit a tile must be to count as nearer: below one grid step squared. */
const NEARER = 1e-6;

/** Berth fields kept before the oldest is dropped. */
const BERTH_CACHE_SIZE = 16;

/** Cached berth fields by graph, then by sleepers, class and goals. */
const BERTH_FIELDS = new WeakMap<
  MoveGraph,
  Map<string, ReadonlyMap<TileKey, number>>
>();

/** Known sleepers by view: the memory is read once a view. */
const SLEEPERS = new WeakMap<PlayerView, readonly Unit[]>();

/** Read broods by view. */
const BROODS = new WeakMap<PlayerView, readonly ReadBrood[]>();

/**
 * The dormant bugs the side knows of: those in sight, and those it saw
 * asleep and has lost sight of since, where it last saw them. A sleeper
 * does not move until its brood wakes, and a brood waking is heard ("A
 * brood stirs"), so a player remembers a chamber's sleepers until then.
 */
export function sleepers(view: PlayerView): readonly Unit[] {
  let known = SLEEPERS.get(view);
  if (known === undefined) {
    const inSight = new Set(view.enemies.map((enemy) => enemy.id));
    const lastSeen = view.mission.vision.tdf?.lastSeen ?? {};
    const remembered = view.mission.units.flatMap((unit) => {
      const at = lastSeen[unit.id];
      return unit.team === "bugs" &&
        unit.hp > 0 &&
        isDormant(unit) &&
        at !== undefined &&
        !inSight.has(unit.id)
        ? [{ ...unit, pos: at }]
        : [];
    });
    known = [...view.enemies.filter(isDormant), ...remembered];
    SLEEPERS.set(view, known);
  }
  return known;
}

/**
 * The view with only the awake bugs as enemies: sleepers are not
 * contact. It knows of no sleepers either, in sight or remembered; what
 * sleeps is read off the view it came from. A view that knows of no
 * sleeper is returned as it is.
 */
export function awakeView(view: PlayerView): PlayerView {
  if (sleepers(view).length === 0) return view;
  const quiet = {
    ...view,
    enemies: view.enemies.filter((enemy) => !isDormant(enemy)),
  };
  SLEEPERS.set(quiet, []);
  return quiet;
}

/**
 * The broods in sight as a player reads them: sleepers within
 * `BROOD_LINK` of one another (a chain of them) are one brood, whose
 * round is centred on their middle and reaches `BROOD_MARGIN` past the
 * farthest of them. In the order of each brood's first sleeper in sight.
 */
export function readBroods(view: PlayerView): readonly ReadBrood[] {
  const cached = BROODS.get(view);
  if (cached !== undefined) return cached;
  const asleep = sleepers(view);
  const group = asleep.map((_, i) => i);
  const root = (i: number): number => {
    let at = i;
    while (group[at] !== at) at = group[at] ?? at;
    return at;
  };
  for (let i = 0; i < asleep.length; i++) {
    for (let j = i + 1; j < asleep.length; j++) {
      const a = asleep[i];
      const b = asleep[j];
      if (a === undefined || b === undefined) continue;
      if (flat(a.pos, b.pos) <= BROOD_LINK) group[root(j)] = root(i);
    }
  }
  const members = new Map<number, Unit[]>();
  asleep.forEach((sleeper, i) => {
    const key = root(i);
    members.set(key, [...(members.get(key) ?? []), sleeper]);
  });
  const broods = [...members.values()].map((brood) => {
    const x = brood.reduce((sum, bug) => sum + bug.pos.x, 0) / brood.length;
    const z = brood.reduce((sum, bug) => sum + bug.pos.z, 0) / brood.length;
    const spread = Math.max(
      ...brood.map((bug) => Math.hypot(bug.pos.x - x, bug.pos.z - z)),
    );
    return { centre: { x, z }, radius: spread + BROOD_MARGIN };
  });
  BROODS.set(view, broods);
  return broods;
}

/**
 * Tile keys inside every read brood's round and within `SLEEPER_BERTH`
 * (flat) of every sleeper in sight, on every level, except those within
 * `GOAL_GROUND` of one of `goals`: the ground round a goal is walked
 * whatever sleeps there, since the goal is the point. Seen from `from`,
 * a unit already inside a round, that round shrinks to just inside the
 * unit: it may step away or round the brood, never nearer.
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
  const nearGoal = (tile: TileCoord): boolean =>
    goals.some((goal) => flat(tile, goal) <= GOAL_GROUND);
  for (const round of roundsFrom(view, from)) {
    const span = Math.sqrt(Math.max(0, round.reach));
    for (
      let x = Math.ceil(round.x - span);
      x <= Math.floor(round.x + span);
      x++
    ) {
      for (
        let z = Math.ceil(round.z - span);
        z <= Math.floor(round.z + span);
        z++
      ) {
        if ((x - round.x) ** 2 + (z - round.z) ** 2 > round.reach) continue;
        for (const tile of index.column(x, z)) {
          if (!nearGoal(tile)) ground.add(index.keyOf(tile));
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
 * rounds the unit keeps out of, its class and the goals.
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
    roundsFrom(view, unit.pos)
      .map(
        (round) =>
          `${round.x.toFixed(3)},${round.z.toFixed(3)}:${round.reach.toFixed(3)}`,
      )
      .sort()
      .join(";"),
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
 * Whether the walk to `option` steps on ground the side has never seen,
 * in a cavern where broods sleep: a unit that walks blind can end a step
 * inside a chamber it had not seen and wake what sleeps there, so a
 * careful player walks to the edge of what it has seen and looks again.
 * Always false on a map with no broods.
 */
export function crossesUnseen(
  unit: Unit,
  reach: Reach,
  option: MoveOption,
  view: PlayerView,
): boolean {
  if ((view.mission.broods ?? []).length === 0) return false;
  const origin = view.graph.index.keyOf(unit.pos);
  let key: TileKey | undefined = option.key;
  while (key !== undefined && key !== origin) {
    if (!view.explored.has(key)) return true;
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
 * Whether a shot or throw would wake a brood in sight: one landing
 * inside a read brood's round or within `SLEEPER_BERTH` of a sleeper,
 * or a loud one fired within earshot of a brood: its round plus the
 * noise radius, and a tile of slack.
 */
export function wakesSleepers(
  view: PlayerView,
  from: TileCoord,
  at: TileCoord,
  loud: boolean,
): boolean {
  const asleep = sleepers(view);
  if (asleep.length === 0) return false;
  const earshot = BROOD_TUNING.wake.noiseRadius + EARSHOT_SLACK;
  return (
    asleep.some((sleeper) => flat(sleeper.pos, at) <= SLEEPER_BERTH) ||
    readBroods(view).some(
      (brood) =>
        flat(brood.centre, at) <= brood.radius ||
        (loud && flat(brood.centre, from) <= brood.radius + earshot),
    )
  );
}

// ===========================================
// Private
// ===========================================

/** A round a unit keeps out of: its middle, and its reach squared. */
interface Round {
  readonly x: number;
  readonly z: number;
  /** Squared flat distance from the middle a tile may be and lie inside. */
  readonly reach: number;
}

/**
 * Every round `from` keeps out of: each read brood's, and each sleeper's
 * berth, each shrunk to just inside a unit at `from` already within it
 * (`shrunkTo`).
 */
function roundsFrom(
  view: PlayerView,
  from: TileCoord | undefined,
): readonly Round[] {
  const whole: Round[] = [
    ...readBroods(view).map((brood) => ({
      x: brood.centre.x,
      z: brood.centre.z,
      reach: brood.radius ** 2,
    })),
    ...sleepers(view).map((sleeper) => ({
      x: sleeper.pos.x,
      z: sleeper.pos.z,
      reach: SLEEPER_BERTH ** 2,
    })),
  ];
  return whole.map((round) => shrunkTo(round, from));
}

/**
 * `round` as a unit at `from` sees it: whole, or for a unit already
 * inside it, every tile nearer its middle than the unit, so the unit may
 * step round or away but never nearer. Squared so that "nearer" is exact
 * on the grid.
 */
function shrunkTo(round: Round, from: TileCoord | undefined): Round {
  if (from === undefined) return round;
  const here = (from.x - round.x) ** 2 + (from.z - round.z) ** 2;
  return here > round.reach
    ? round
    : { ...round, reach: Math.max(0, here - NEARER) };
}

/** Euclidean distance on the ground plane. */
function flat(
  a: { readonly x: number; readonly z: number },
  b: { readonly x: number; readonly z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

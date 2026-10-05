import { DIRECTIONS } from "../../../core/model/direction";
import type { UnitClass } from "../../../mapgen/model/pass-mask";
import { allows } from "../../../mapgen/model/pass-mask";
import type { PropKindId } from "../../../mapgen/model/prop";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { Tile } from "../../../mapgen/model/tile";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { attackTile } from "../../model/attack-command";
import type { AttackPreview } from "../../model/attack-preview";
import type { TacticalCommand } from "../../model/tactical-command";
import type { Unit } from "../../model/unit";
import { isCombatUnit, passMaskFor } from "../../model/unit";
import { useEquipment } from "../../model/use-equipment-command";
import { canTargetTile, demoForceOf } from "../../model/weapon-profile";
import { previewTileAttack, tileWeaponOptions } from "../combat-service";
import { equipmentOf, previewEquipmentUse } from "../equipment-service";
import { hasLineOfSight } from "../sight-service";
import type { MoveGraph, TileKey } from "../movement-service";
import type { UnitOrder } from "./objective-strategy.test-helper";
import type { PlayerRules } from "./player-combat.test-helper";
import { dangerKeys } from "./player-goals.test-helper";
import type { MoveOption } from "./player-navigation.test-helper";
import {
  fieldAround,
  fieldFor,
  moveTo,
  reachNow,
} from "./player-navigation.test-helper";
import { stepsTo } from "./player-policy.test-helper";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// Breaching (#1238)
// ===========================================
//
// Where an order's goals stand behind walls (the great pod's hull and
// membrane), no walk reaches them and every distance field says
// Infinity. A player opens the way instead: it prices each wall the
// force could bring down in steps, by its own reading of what opening
// that wall costs (its `BreachStyle`), and takes the cheapest way
// through, walls included. The first wall on that way is the breach.
//
//   order.breach, goals out of walking reach
//     ──► breach field: steps from the goals, a wall priced by the style
//     ──► trace from the drop ship down the field: the first wall is the
//         breach, the one the whole force works
//   the unit can open it now (a ready gun of enough force, or a grenade
//   when the style throws; nobody of ours in the blast) ──► fire / throw
//   the unit carries something that could ──► walk to a tile it can
//                                             fire on the wall from
//   the unit carries nothing that could   ──► close to BREACH_HOLD, wait
//
// The rules decide what falls (`demolish`): a gun opens a wall when its
// force is at least the wall's. Once a wall is down the map is a new
// map, its graph a new graph, and the next decision plans afresh: walk
// in if the goals are now in reach, or on to the next wall.

/**
 * How a player prices a wall it could bring down: the steps of walking
 * it would give up to avoid opening it. The new player's price is the
 * same for every wall; the expert's follows what opening the wall takes.
 */
export interface BreachStyle {
  /** Names the style in the field cache. */
  readonly id: string;
  /** Steps opening a wall of demolition `force` is worth to this player. */
  wallSteps(force: number): number;
  /** Whether the player throws grenades at a wall, not only at bugs. */
  readonly throws: boolean;
  /**
   * What a shot or throw at the wall is worth: from its hit chance (a
   * percentage) and the wall tiles its blast would bring down. The
   * highest is taken, a gun before a grenade on a tie.
   */
  shotValue(hitChance: number, opened: number): number;
}

/** The wall a unit is to open, and its way through. */
export interface Breach {
  /** The first wall on the cheapest way to the goals. */
  readonly wall: Tile;
  /** The demolition force that opens it. */
  readonly force: number;
  /** The way's price from where the unit stands, in steps, walls priced by the style. */
  readonly steps: number;
}

/**
 * Field steps from the wall within which a unit that cannot open it
 * waits: clear of a rocket's blast and a grenade's, close enough to go
 * through the moment it falls.
 */
const BREACH_HOLD = 3;

/**
 * Tiles from the wall, at most, a unit that can open it looks for a
 * tile to fire from: near enough that the shot is a likely one, far
 * enough to find a line past the force crowding the wall.
 */
const FIRING_REACH = 6;

/** Steps a trace walks before it gives up on a field that does not descend. */
const TRACE_LIMIT = 400;

/** Fields kept per graph before the oldest is dropped. */
const BREACH_CACHE_SIZE = 16;

/** Breach fields by graph, then by pass class, force, style and goal set. */
const BREACH_FIELDS = new WeakMap<
  MoveGraph,
  Map<string, ReadonlyMap<TileKey, number>>
>();

/** Prop kinds by prop id, per map. */
const PROP_KINDS = new WeakMap<TacticalMap, ReadonlyMap<string, PropKindId>>();

/** The force's wall by breach field: `null` when the field leads to none. */
const FORCE_WALLS = new WeakMap<
  ReadonlyMap<TileKey, number>,
  { readonly wall: Tile; readonly force: number } | null
>();

// ===========================================
// Planning
// ===========================================

/**
 * The wall `unit` is to open for `order`, or undefined when there is
 * none to open: the order does not breach, its goals are in walking
 * reach, the rules name no structures, the force carries nothing that
 * opens a wall, or no wall it could open leads to the goals.
 *
 * ```
 *   field: steps from the goals; a walk step costs 1, a step into a
 *          wall the style's price for its force (style.wallSteps)
 *   trace: from the drop ship, always to the neighbour with the least
 *          step + field; the first wall reached is the breach
 *   steps: the field where the unit stands
 * ```
 *
 * The trace starts at the drop ship, where the force landed, not at
 * the unit: the whole force breaches the one wall, so a unit that
 * cannot open it waits clear of the blast that does, rather than at a
 * wall of its own beside it.
 *
 * @param view - What the side sees.
 * @param unit - The unit planning.
 * @param order - Its order.
 * @param rules - The rules; `structures` prices the walls.
 * @param style - How the player prices a wall.
 * @returns The breach, or undefined.
 */
export function planBreach(
  view: PlayerView,
  unit: Unit,
  order: UnitOrder,
  rules: PlayerRules,
  style: BreachStyle,
): Breach | undefined {
  const structures = rules.structures;
  if (
    order.breach !== true ||
    structures === undefined ||
    order.goals.length === 0 ||
    Number.isFinite(stepsTo(view, unit, order.goals))
  ) {
    return undefined;
  }
  const force = forceCarried(view, rules, style);
  if (force <= 0) return undefined;
  const kinds = propKinds(view.mission.map);
  const wallForce = (tile: Tile, mask: UnitClass): number | undefined => {
    if (tile.propId === undefined || allows(tile.pass, mask)) return undefined;
    const kind = kinds.get(tile.propId);
    const needed = kind === undefined ? undefined : structures.propForce(kind);
    return needed !== undefined && needed <= force ? needed : undefined;
  };
  const mask = passMaskFor(unit.passClass);
  const field = breachField(
    view.graph,
    order.goals,
    mask,
    force,
    style,
    wallForce,
  );
  const steps = field.get(view.graph.index.keyOf(unit.pos));
  if (steps === undefined) return undefined;
  const wall = forceWall(view, mask, field, style, wallForce);
  return wall === undefined ? undefined : { ...wall, steps };
}

/**
 * Field steps from `unit` to the order's goals, for choosing a job: the
 * walk when there is one; for a breaching order behind walls, the way
 * through priced by the style; Infinity otherwise. Equal to `stepsTo`
 * for every order that does not breach.
 *
 * @param view - What the side sees.
 * @param unit - The unit choosing.
 * @param order - The job's order.
 * @param rules - The rules.
 * @param style - How the player prices a wall.
 * @returns The steps.
 */
export function jobSteps(
  view: PlayerView,
  unit: Unit,
  order: UnitOrder,
  rules: PlayerRules,
  style: BreachStyle,
): number {
  const walk = stepsTo(view, unit, order.goals);
  if (Number.isFinite(walk) || order.breach !== true) return walk;
  return planBreach(view, unit, order, rules, style)?.steps ?? walk;
}

// ===========================================
// Acting
// ===========================================

/**
 * One command toward opening the way to the order's goals, or undefined
 * when the order needs no breach or the unit has nothing to do for it
 * (it waits within `BREACH_HOLD` of a wall it cannot open).
 *
 * ```
 *   no breach                           ──► undefined
 *   can open it now (the style's pick)  ──► Attack the wall's tile / UseEquipment
 *   carries the force to open it        ──► an action's walk to a tile it can
 *                                           fire on the wall from, round the force
 *   cannot open it, beyond BREACH_HOLD  ──► an action's walk, no nearer than that
 *   cannot open it, within              ──► undefined
 * ```
 *
 * @param unit - The unit acting.
 * @param order - Its order.
 * @param view - What the side sees.
 * @param rules - The rules.
 * @param style - How the player prices a wall and whether it throws.
 * @returns The command, or undefined.
 */
export function breachNext(
  unit: Unit,
  order: UnitOrder,
  view: PlayerView,
  rules: PlayerRules,
  style: BreachStyle,
): TacticalCommand | undefined {
  const breach = planBreach(view, unit, order, rules, style);
  if (breach === undefined || unit.ap <= 0) return undefined;
  const open = openNow(unit, breach, view, rules, style);
  if (open !== undefined) return open;
  const range = openerRange(unit, breach.force, view, rules, style);
  return range > 0
    ? approach(unit, breach, view, rules, Math.min(range, FIRING_REACH))
    : closeIn(unit, breach, view, rules, BREACH_HOLD);
}

// ===========================================
// Private: the field
// ===========================================

/**
 * Steps from the nearest of `goals` to every tile, walls the force can
 * open included: a walk step costs 1 and stepping into a wall its
 * style's price, as a Dijkstra search over a bucket queue (every price
 * is a whole number of steps). Goals nobody stands on seed from their
 * walkable neighbours, as `distanceField`'s do. Cached per graph.
 */
function breachField(
  graph: MoveGraph,
  goals: readonly TileCoord[],
  mask: UnitClass,
  force: number,
  style: BreachStyle,
  wallForce: (tile: Tile, mask: UnitClass) => number | undefined,
): ReadonlyMap<TileKey, number> {
  const goalKeys = goals
    .filter((goal) => graph.index.inBounds(goal))
    .map((goal) => graph.index.keyOf(goal))
    .sort((a, b) => a - b);
  const cacheKey = `${String(mask)}|${String(force)}|${style.id}|${goalKeys.join(",")}`;
  let cache = BREACH_FIELDS.get(graph);
  if (cache === undefined) {
    cache = new Map();
    BREACH_FIELDS.set(graph, cache);
  }
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const index = graph.index;
  const costs = new Map<TileKey, number>();
  const buckets: Tile[][] = [];
  const push = (tile: Tile, cost: number): void => {
    const key = index.keyOf(tile);
    const known = costs.get(key);
    if (known !== undefined && known <= cost) return;
    costs.set(key, cost);
    (buckets[cost] ??= []).push(tile);
  };
  for (const goal of goals) {
    const tile = index.getAt(goal) ?? index.column(goal.x, goal.z)[0];
    if (tile === undefined) continue;
    if (allows(tile.pass, mask)) {
      push(tile, 0);
      continue;
    }
    for (const direction of DIRECTIONS) {
      const next = index.neighbour(goal, direction);
      if (next !== undefined && allows(next.pass, mask)) push(next, 1);
    }
  }
  for (let cost = 0; cost < buckets.length; cost++) {
    for (const tile of buckets[cost] ?? []) {
      if (costs.get(index.keyOf(tile)) !== cost) continue;
      const wall = wallForce(tile, mask);
      const into = wall === undefined ? 1 : style.wallSteps(wall);
      for (const from of stepsInto(
        graph,
        tile,
        mask,
        wall !== undefined,
        wallForce,
      )) {
        push(from, cost + into);
      }
    }
  }
  if (cache.size >= BREACH_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey, costs);
  return costs;
}

/**
 * The tiles a unit of `mask` can step from onto `tile`, walls it could
 * open counted as ground once open: a walkable tile is reached by a
 * walk step or from a wall beside it on its level, a wall from any
 * walkable tile or wall beside it on its level.
 */
function stepsInto(
  graph: MoveGraph,
  tile: Tile,
  mask: UnitClass,
  isWall: boolean,
  wallForce: (tile: Tile, mask: UnitClass) => number | undefined,
): readonly Tile[] {
  const beside: Tile[] = [];
  for (const direction of DIRECTIONS) {
    const next = graph.index.neighbour(tile, direction);
    if (next === undefined) continue;
    if (wallForce(next, mask) !== undefined) {
      beside.push(next);
    } else if (isWall && allows(next.pass, mask)) {
      beside.push(next);
    }
  }
  return isWall
    ? beside
    : [...graph.reachability.neighbours(tile, mask), ...beside];
}

/**
 * The wall the whole force breaches: the first on the cheapest way down
 * `field` from the drop ship tile the field prices lowest (the lower key
 * on a tie). Cached per field, so per map, goals, class, force and style.
 */
function forceWall(
  view: PlayerView,
  mask: UnitClass,
  field: ReadonlyMap<TileKey, number>,
  style: BreachStyle,
  wallForce: (tile: Tile, mask: UnitClass) => number | undefined,
): { readonly wall: Tile; readonly force: number } | undefined {
  const cached = FORCE_WALLS.get(field);
  if (cached !== undefined) return cached ?? undefined;
  const index = view.graph.index;
  let start: { tile: Tile; key: TileKey; steps: number } | undefined;
  for (const coord of view.mission.extraction) {
    const tile = index.getAt(coord);
    if (tile === undefined) continue;
    const key = index.keyOf(tile);
    const steps = field.get(key);
    if (steps === undefined) continue;
    if (
      start === undefined ||
      steps < start.steps ||
      (steps === start.steps && key < start.key)
    ) {
      start = { tile, key, steps };
    }
  }
  const wall =
    start === undefined
      ? undefined
      : traceWall(view.graph, start.tile, mask, field, style, wallForce);
  FORCE_WALLS.set(field, wall ?? null);
  return wall;
}

/**
 * The first wall on the cheapest way from `start` down `field`: each
 * step to the neighbour with the least step price plus field, the lower
 * key on a tie, until a wall is next. Undefined when the field stops
 * descending.
 */
function traceWall(
  graph: MoveGraph,
  start: Tile,
  mask: UnitClass,
  field: ReadonlyMap<TileKey, number>,
  style: BreachStyle,
  wallForce: (tile: Tile, mask: UnitClass) => number | undefined,
): { readonly wall: Tile; readonly force: number } | undefined {
  const index = graph.index;
  let current = start;
  let here = field.get(index.keyOf(start)) ?? Number.POSITIVE_INFINITY;
  for (let walked = 0; walked < TRACE_LIMIT; walked++) {
    let best: { tile: Tile; total: number; key: TileKey } | undefined;
    for (const next of stepsFrom(graph, current, mask, wallForce)) {
      const key = index.keyOf(next);
      const rest = field.get(key);
      if (rest === undefined) continue;
      const wall = wallForce(next, mask);
      const total = rest + (wall === undefined ? 1 : style.wallSteps(wall));
      if (
        best === undefined ||
        total < best.total ||
        (total === best.total && key < best.key)
      ) {
        best = { tile: next, total, key };
      }
    }
    if (best === undefined || best.total > here) return undefined;
    const force = wallForce(best.tile, mask);
    if (force !== undefined) return { wall: best.tile, force };
    current = best.tile;
    here = field.get(best.key) ?? here;
  }
  return undefined;
}

/** The tiles a unit of `mask` on walkable `tile` can step to, walls it could open included. */
function stepsFrom(
  graph: MoveGraph,
  tile: Tile,
  mask: UnitClass,
  wallForce: (tile: Tile, mask: UnitClass) => number | undefined,
): readonly Tile[] {
  const walls: Tile[] = [];
  for (const direction of DIRECTIONS) {
    const next = graph.index.neighbour(tile, direction);
    if (next !== undefined && wallForce(next, mask) !== undefined) {
      walls.push(next);
    }
  }
  return [...graph.reachability.neighbours(tile, mask), ...walls];
}

// ===========================================
// Private: what the force carries
// ===========================================

/**
 * The most demolition force the side's combat units carry, ready or
 * not: every gun that can fire at the ground, and, for a style that
 * throws, every blast item with a use left.
 */
function forceCarried(
  view: PlayerView,
  rules: PlayerRules,
  style: BreachStyle,
): number {
  let best = 0;
  for (const unit of view.own) {
    if (!isCombatUnit(unit)) continue;
    best = Math.max(best, unitForce(unit, view, rules, style));
  }
  return best;
}

/**
 * The longest reach among what `unit` carries that opens a wall of
 * `force`, ready or not: its guns that fire at the ground, and, for a
 * style that throws, its grenades with a use left. `0` when nothing it
 * carries would.
 */
function openerRange(
  unit: Unit,
  force: number,
  view: PlayerView,
  rules: PlayerRules,
  style: BreachStyle,
): number {
  const template = view.mission.templates[unit.templateId];
  let best = 0;
  for (const weapon of template?.weapons ?? []) {
    if (canTargetTile(weapon.profile) && demoForceOf(weapon.profile) >= force) {
      best = Math.max(best, weapon.profile.range);
    }
  }
  if (style.throws) {
    for (const item of equipmentOf(template, unit, rules.catalogue)) {
      const profile = item.definition.profile;
      if (
        item.definition.kind === "blast" &&
        item.usesLeft > 0 &&
        profile !== undefined &&
        demoForceOf(profile) >= force
      ) {
        best = Math.max(best, item.definition.range);
      }
    }
  }
  return best;
}

/** The most demolition force one unit carries, ready or not. */
function unitForce(
  unit: Unit,
  view: PlayerView,
  rules: PlayerRules,
  style: BreachStyle,
): number {
  const template = view.mission.templates[unit.templateId];
  let best = 0;
  for (const weapon of template?.weapons ?? []) {
    if (canTargetTile(weapon.profile)) {
      best = Math.max(best, demoForceOf(weapon.profile));
    }
  }
  if (style.throws) {
    for (const item of equipmentOf(template, unit, rules.catalogue)) {
      const profile = item.definition.profile;
      if (item.definition.kind === "blast" && item.usesLeft > 0 && profile) {
        best = Math.max(best, demoForceOf(profile));
      }
    }
  }
  return best;
}

/** Prop kinds by prop id on `map`, built once per map. */
function propKinds(map: TacticalMap): ReadonlyMap<string, PropKindId> {
  const cached = PROP_KINDS.get(map);
  if (cached !== undefined) return cached;
  const kinds = new Map(map.props.map((prop) => [prop.id, prop.kind]));
  PROP_KINDS.set(map, kinds);
  return kinds;
}

// ===========================================
// Private: acting
// ===========================================

/**
 * The shot or throw that opens the breach from where the unit stands:
 * every ready gun that can fire at the ground with force enough, and,
 * for a style that throws, every grenade with force enough, that the
 * rules accept at the wall's tile with nobody of ours in the blast; the
 * one the style values most (`shotValue`), a gun before a grenade on a
 * tie.
 */
function openNow(
  unit: Unit,
  breach: Breach,
  view: PlayerView,
  rules: PlayerRules,
  style: BreachStyle,
): TacticalCommand | undefined {
  const tile = { x: breach.wall.x, y: breach.wall.y, z: breach.wall.z };
  let best: { command: TacticalCommand; value: number } | undefined;
  const consider = (
    command: TacticalCommand,
    preview: AttackPreview,
    force: number,
  ): void => {
    const ours = (preview.blast?.victims ?? []).some(
      (victim) => victim.team === unit.team,
    );
    if (ours) return;
    const opened = wallsOpened(
      view,
      preview.blast?.tiles ?? [tile],
      force,
      rules,
    );
    const value = style.shotValue(preview.hitChance, opened);
    if (best === undefined || value > best.value) {
      best = { command, value };
    }
  };
  for (const option of tileWeaponOptions(view.mission, unit.id, rules.combat)) {
    if (!option.ready || demoForceOf(option.weapon.profile) < breach.force) {
      continue;
    }
    const preview = previewTileAttack(
      view.mission,
      unit.id,
      tile,
      rules.combat,
      option.weapon.id,
    );
    if (preview.ok) {
      consider(
        attackTile(unit.id, tile, option.weapon.id),
        preview.value,
        demoForceOf(option.weapon.profile),
      );
    }
  }
  if (style.throws) {
    const template = view.mission.templates[unit.templateId];
    for (const item of equipmentOf(template, unit, rules.catalogue)) {
      const profile = item.definition.profile;
      if (
        item.definition.kind !== "blast" ||
        item.usesLeft <= 0 ||
        profile === undefined ||
        demoForceOf(profile) < breach.force
      ) {
        continue;
      }
      const preview = previewEquipmentUse(
        view.mission,
        unit.id,
        item.definition.id,
        tile,
        rules,
      );
      if (preview.ok) {
        consider(
          useEquipment(unit.id, item.definition.id, tile),
          preview.value,
          demoForceOf(profile),
        );
      }
    }
  }
  return best?.command;
}

/**
 * One action's walk to where the unit can fire on the wall: a free tile
 * within `reach` of it with a line of sight to it, by a walk round the
 * units standing now (so a squad holding the near ground never strands
 * the rocket behind it); the nearest such tile, the cheaper walk on a
 * tie, never into a charge's blast. Nothing when it stands on one
 * already (its shot waits on a reload or a friend in the blast) or none
 * can be reached.
 */
function approach(
  unit: Unit,
  breach: Breach,
  view: PlayerView,
  rules: PlayerRules,
  reach: number,
): TacticalCommand | undefined {
  const spots = firingSpots(view, unit, breach.wall, reach);
  if (spots.length === 0) return closeIn(unit, breach, view, rules, 0);
  const field = fieldAround(view.mission, view.graph, unit, spots);
  const walk = reachNow(view.mission, unit, view.graph, field, 1);
  if (walk.here === 0) return undefined;
  const danger = dangerKeys(view, rules.catalogue);
  let best: MoveOption | undefined;
  for (const option of walk.options) {
    if (option.distance >= walk.here || danger.has(option.key)) continue;
    if (
      best === undefined ||
      option.distance < best.distance ||
      (option.distance === best.distance && option.cost < best.cost)
    ) {
      best = option;
    }
  }
  return best === undefined ? undefined : moveTo(unit, walk, best, view.graph);
}

/**
 * The tiles within `reach` of `wall` (flat distance) that `unit` could
 * stand on and fire from: walkable for its class, nobody else on them,
 * a clear line of sight to the wall's tile.
 */
function firingSpots(
  view: PlayerView,
  unit: Unit,
  wall: Tile,
  reach: number,
): readonly Tile[] {
  const index = view.graph.index;
  const mask = passMaskFor(unit.passClass);
  const taken = new Set(
    view.mission.units
      .filter((other) => other.hp > 0 && other.id !== unit.id)
      .map((other) => index.keyOf(other.pos)),
  );
  const spots: Tile[] = [];
  for (let dx = -reach; dx <= reach; dx++) {
    const span = reach - Math.abs(dx);
    for (let dz = -span; dz <= span; dz++) {
      for (const tile of index.column(wall.x + dx, wall.z + dz)) {
        if (
          allows(tile.pass, mask) &&
          !taken.has(index.keyOf(tile)) &&
          hasLineOfSight(view.mission.map, tile, wall, index)
        ) {
          spots.push(tile);
        }
      }
    }
  }
  return spots;
}

/**
 * How many of `tiles` hold a wall that `force` brings down: the width
 * of the hole a blast over them would leave.
 */
function wallsOpened(
  view: PlayerView,
  tiles: readonly TileCoord[],
  force: number,
  rules: PlayerRules,
): number {
  const structures = rules.structures;
  if (structures === undefined) return 0;
  const kinds = propKinds(view.mission.map);
  let opened = 0;
  for (const coord of tiles) {
    const propId = view.graph.index.getAt(coord)?.propId;
    const kind = propId === undefined ? undefined : kinds.get(propId);
    const needed = kind === undefined ? undefined : structures.propForce(kind);
    if (needed !== undefined && needed <= force) opened += 1;
  }
  return opened;
}

/**
 * One action's walk toward the breach: the reachable tile nearest it
 * but no nearer than `hold` field steps (its walkable neighbours are
 * one step), never into a charge's blast; the cheaper walk on a tie.
 * Nothing once within `hold` of it.
 */
function closeIn(
  unit: Unit,
  breach: Breach,
  view: PlayerView,
  rules: PlayerRules,
  hold: number,
): TacticalCommand | undefined {
  const near = Math.max(1, hold);
  const field = fieldFor(view.graph, unit, [breach.wall]);
  const reach = reachNow(view.mission, unit, view.graph, field, 1);
  if (reach.here <= near) return undefined;
  const danger = dangerKeys(view, rules.catalogue);
  let best: MoveOption | undefined;
  for (const option of reach.options) {
    if (
      option.distance >= reach.here ||
      option.distance < near ||
      danger.has(option.key)
    ) {
      continue;
    }
    if (
      best === undefined ||
      option.distance < best.distance ||
      (option.distance === best.distance && option.cost < best.cost)
    ) {
      best = option;
    }
  }
  return best === undefined ? undefined : moveTo(unit, reach, best, view.graph);
}

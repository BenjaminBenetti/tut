import type { Rng } from "../../core/model/rng";
import { CoverLevel } from "../../mapgen/model/cover";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import type { MoveCommand } from "../../tactical/model/move-command";
import { move } from "../../tactical/model/move-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import {
  attackTerrain,
  damageRange,
  hitChance,
  validateAttack,
} from "../../tactical/service/combat-service";
import type { MoveGraph } from "../../tactical/service/movement-service";
import {
  buildMoveGraph,
  pathTo,
  searchMoves,
} from "../../tactical/service/movement-service";
import {
  coverAgainst,
  hasLineOfSight,
} from "../../tactical/service/sight-service";

// ===========================================
// Types
// ===========================================

/** A tile a unit can reach this turn and what it costs in steps. */
export interface ReachableTile {
  readonly tile: TileCoord;
  readonly steps: number;
}

/** A target the unit could attack from where it stands, priced. */
export interface AttackOption {
  readonly target: Unit;
  /** Percent, after cover, range, flanking and elevation. */
  readonly hitChance: number;
  /** Mean damage of one hit after armor. */
  readonly meanDamage: number;
  /** Expected fraction of the target's remaining hit points removed, `[0, 1]`. */
  readonly value: number;
  /** True when a hit at the top of the damage range would kill. */
  readonly canKill: boolean;
}

// ===========================================
// Units
// ===========================================

/** Living units on the other team. */
export function livingEnemies(mission: TacticalState, unit: Unit): Unit[] {
  return mission.units.filter((u) => u.team !== unit.team && u.hp > 0);
}

/** Living units on the same team, excluding the unit itself. */
export function livingAllies(mission: TacticalState, unit: Unit): Unit[] {
  return mission.units.filter(
    (u) => u.team === unit.team && u.hp > 0 && u.id !== unit.id,
  );
}

/** The closest living enemy by Manhattan distance, or undefined when none. */
export function nearestEnemy(
  mission: TacticalState,
  unit: Unit,
): Unit | undefined {
  let best: Unit | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of livingEnemies(mission, unit)) {
    const distance = tileDistance(unit.pos, enemy.pos);
    if (distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

/** Manhattan distance across the ground plane; levels are ignored, as weapons range. */
export function tileDistance(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

// ===========================================
// Hunting
// ===========================================

/**
 * Where a bug that can perceive no enemy should head (#559): the tile of
 * the TDF landing zone nearest `from`, or undefined on a map with no
 * deploy hook.
 *
 * Since ADR 0006 a behaviour is handed only what its side can see, and
 * all three shipped behaviours were written as "find the best enemy,
 * then act" — so a bug that saw nothing did nothing, and a player who
 * stood still was never attacked at all. Measured on #559: bugs got no
 * closer than 26 tiles in 25 turns and the squad finished untouched.
 *
 * The landing zone is the answer that restores pressure without
 * restoring omniscience. It is **static map knowledge**, not a live
 * enemy position: a bug does not learn where the squad *is*, only where
 * something loud came down, which it would know from the noise. It also
 * guarantees a mission resolves — a player who holds still is holding
 * still near where they landed, so the map comes to them.
 *
 * The alternatives in #559 were weighed and rejected:
 * - *its own spawner's hatch area* is a defensive posture, so a player
 *   who never advances is never reached;
 * - *the last place this side saw an enemy* is empty before first
 *   contact, which is exactly the measured failure — no contact ever
 *   happened. It is the right **second** layer once a side has seen
 *   something, and is left for a follow-up.
 */
export function landingSite(
  mission: TacticalState,
  from: TileCoord,
): TileCoord | undefined {
  let best: TileCoord | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const zone of mission.map.hooks.deployZones) {
    for (const tile of zone.tiles) {
      const distance = tileDistance(from, tile);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = tile;
      }
    }
  }
  return best;
}

/**
 * A move toward `target` scored by `score`, or nothing when the bug is
 * boxed in or already on the best tile it can reach. The shared half of
 * every behaviour's hunt: each supplies its own `score` so a lurker
 * still sneaks and a brute still lumbers rather than the three sharing
 * one gait (#559).
 */
export function advanceToward(
  mission: TacticalState,
  unitId: UnitId,
  score: (tile: TileCoord) => number,
  graph: MoveGraph,
  rng: Rng,
): MoveCommand | undefined {
  const unit = mission.units.find((u) => u.id === unitId);
  if (unit === undefined) {
    return undefined;
  }
  const best = bestBy(
    reachableTiles(mission, unitId, graph),
    (t) => score(t.tile),
    rng,
  );
  if (best === undefined || score(best.tile) <= score(unit.pos)) {
    return undefined;
  }
  return moveTowards(mission, unitId, best.tile, graph);
}

// ===========================================
// Scores
// ===========================================

/**
 * `1` at distance zero falling linearly to `0` at `maxDistance` and
 * beyond, so a behaviour can prefer closing (or, negated, opening) the
 * gap on a shared scale.
 */
export function distanceScore(
  from: TileCoord,
  to: TileCoord,
  maxDistance: number,
): number {
  if (maxDistance <= 0) {
    return 0;
  }
  return Math.max(0, 1 - tileDistance(from, to) / maxDistance);
}

/**
 * How well `tile` shields against `attackers`: the worst cover among
 * them, as a fraction of high cover, so one exposed flank counts. `0`
 * with no attackers.
 */
export function coverScore(
  mission: TacticalState,
  tile: TileCoord,
  attackers: readonly TileCoord[],
  index: TileIndex = new TileIndex(mission.map),
): number {
  if (attackers.length === 0) {
    return 0;
  }
  let worst: CoverLevel = CoverLevel.HIGH;
  for (const attacker of attackers) {
    const level = coverAgainst(mission.map, tile, attacker, index);
    if (level < worst) {
      worst = level;
    }
  }
  return worst / CoverLevel.HIGH;
}

/** How many of `enemies` see `tile`, as a fraction; `0` with no enemies. */
export function exposureScore(
  mission: TacticalState,
  tile: TileCoord,
  enemies: readonly Unit[],
  index: TileIndex = new TileIndex(mission.map),
): number {
  if (enemies.length === 0) {
    return 0;
  }
  const seen = enemies.filter((e) =>
    hasLineOfSight(mission.map, e.pos, tile, index),
  ).length;
  return seen / enemies.length;
}

/**
 * How many of `enemies` are *watching* `tile` — on overwatch and with
 * line of sight to it — as a fraction of every enemy on overwatch. `0`
 * when none of them is watching at all.
 *
 * A behaviour that fears reaction fire subtracts it; the brute adds it,
 * because a shot spent on armor is a shot not spent on the swarm.
 */
export function overwatchScore(
  mission: TacticalState,
  tile: TileCoord,
  enemies: readonly Unit[],
  index: TileIndex = new TileIndex(mission.map),
): number {
  const watchers = enemies.filter(
    (e) => e.hp > 0 && e.status.includes("overwatch"),
  );
  if (watchers.length === 0) {
    return 0;
  }
  const covering = watchers.filter((w) =>
    hasLineOfSight(mission.map, w.pos, tile, index),
  ).length;
  return covering / watchers.length;
}

/**
 * How much `enemies` are bunched around `tile`: the number within
 * `radius` tiles divided by their count. A brute uses it to find the
 * crowd; a lurker, negated, to find the straggler.
 */
export function clumpScore(
  tile: TileCoord,
  enemies: readonly Unit[],
  radius: number,
): number {
  if (enemies.length === 0) {
    return 0;
  }
  const near = enemies.filter(
    (e) => tileDistance(tile, e.pos) <= radius,
  ).length;
  return near / enemies.length;
}

/**
 * Expected value of `attacker` firing at `target` from `from`: hit
 * chance times mean damage, as a fraction of the target's remaining hit
 * points, capped at 1. Prices a finishing blow above a scratch on a
 * tank. Does not check range or line of sight; see `attackOptions`.
 */
export function targetValue(
  mission: TacticalState,
  attacker: Unit,
  from: TileCoord,
  target: Unit,
  combat: CombatTuning,
  index: TileIndex = new TileIndex(mission.map),
): Pick<AttackOption, "hitChance" | "meanDamage" | "value" | "canKill"> {
  const weapon = mission.templates[attacker.templateId]?.weapon;
  const armor = mission.templates[target.templateId]?.armor ?? 0;
  if (weapon === undefined) {
    return { hitChance: 0, meanDamage: 0, value: 0, canKill: false };
  }
  const terrain = attackTerrain(mission.map, from, target.pos, index);
  const chance = hitChance(weapon, terrain, combat);
  const [low, high] = damageRange(weapon, armor, combat);
  const meanDamage = (low + high) / 2;
  const remaining = Math.max(1, target.hp);
  return {
    hitChance: chance,
    meanDamage,
    value: Math.min(1, ((chance / 100) * meanDamage) / remaining),
    canKill: high >= target.hp,
  };
}

// ===========================================
// Options
// ===========================================

/**
 * Every enemy `unitId` could attack from where it stands right now,
 * validated by the combat service (range, line of sight, action
 * points) and sorted best value first.
 */
export function attackOptions(
  mission: TacticalState,
  unitId: UnitId,
  combat: CombatTuning,
): AttackOption[] {
  const attacker = mission.units.find((u) => u.id === unitId);
  if (attacker === undefined) {
    return [];
  }
  const index = new TileIndex(mission.map);
  const options: AttackOption[] = [];
  for (const target of livingEnemies(mission, attacker)) {
    if (!validateAttack(mission, unitId, target.id, combat).ok) {
      continue;
    }
    options.push({
      target,
      ...targetValue(mission, attacker, attacker.pos, target, combat, index),
    });
  }
  return options.sort((a, b) => b.value - a.value);
}

/** Every tile `unitId` can reach this turn, with its step cost, excluding where it stands. */
export function reachableTiles(
  mission: TacticalState,
  unitId: UnitId,
  graph: MoveGraph = buildMoveGraph(mission.map),
): ReachableTile[] {
  const unit = mission.units.find((u) => u.id === unitId);
  if (unit === undefined) {
    return [];
  }
  const search = searchMoves(mission, unit, graph);
  const origin = graph.index.keyOf(unit.pos);
  const tiles: ReachableTile[] = [];
  for (const [key, tile] of search.tiles) {
    if (key === origin) {
      continue;
    }
    tiles.push({
      tile: { x: tile.x, y: tile.y, z: tile.z },
      steps: search.costs.get(key) ?? 0,
    });
  }
  return tiles;
}

/**
 * The highest-scoring item, breaking exact ties with `rng` so identical
 * bugs do not all pick the same tile. Undefined for no items.
 */
export function bestBy<T>(
  items: readonly T[],
  score: (item: T) => number,
  rng: Rng,
): T | undefined {
  let best: T[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) {
      bestScore = s;
      best = [item];
    } else if (s === bestScore) {
      best.push(item);
    }
  }
  if (best.length === 0) {
    return undefined;
  }
  return best.length === 1 ? best[0] : best[rng.nextInt(0, best.length - 1)];
}

/** A move command along the cheapest path to `tile`, or undefined when unreachable. */
export function moveTowards(
  mission: TacticalState,
  unitId: UnitId,
  tile: TileCoord,
  graph: MoveGraph = buildMoveGraph(mission.map),
): MoveCommand | undefined {
  const path = pathTo(mission, unitId, tile, graph);
  return path === undefined || path.length === 0
    ? undefined
    : move(unitId, path);
}

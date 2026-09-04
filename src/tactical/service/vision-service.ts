import type { GridPos } from "../../core/model/grid";
import { manhattanDistance } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type {
  SideVision,
  Spawner,
  TacticalState,
  VisionTileKey,
} from "../model/tactical-state";
import { NO_VISION, TEAMS_BY_VISION } from "../model/tactical-state";
import type { Team, Unit, UnitId } from "../model/unit";
import { UNIT_LOST } from "../model/unit-lost-event";
import { UNIT_SPOTTED } from "../model/unit-spotted-event";
import { hasLineOfSight } from "./sight-service";

// ===========================================
// Seeing
// ===========================================

/**
 * How far `unit` can see, in tiles. Zero for a unit whose template is
 * missing, so an unknown unit sees nothing rather than everything.
 *
 * @param mission - The mission the unit is in.
 * @param unit - The unit doing the looking.
 * @returns Its sight range in tiles.
 */
export function sightRangeOf(mission: TacticalState, unit: Unit): number {
  return mission.templates[unit.templateId]?.sightRange ?? 0;
}

/**
 * Whether `watcher` can see the tile at `at`: inside its sight range by
 * the map-plane metric, with a clear line to it.
 *
 * **Sight is per watcher, not per side, and that is a decision** (#579).
 * ADR 0006 §3 governs what a *side* may draw and know; whether a
 * particular unit has eyes on something is a different question, and the
 * rules already ask it per unit elsewhere — `validateTargeting` traces
 * from the attacker, not from the team. A watcher holding its shot
 * because only a teammate across the map can see the mover would read as
 * a bug rather than as doctrine: you shoot what you see.
 *
 * **It is also the only place the rule is written.** `computeVision` and
 * the overwatch reaction both call this rather than each spelling out
 * range-and-line-of-sight, so a rule that grows a term — elevation, a
 * vision cone, a `hidden` status, a scanner that sees without a line —
 * moves both. When they were two copies they agreed only because they
 * were the same two lines, and would have drifted in silence: the
 * renderer showing a bug as spotted while overwatch held its fire, with
 * both sides individually correct and no test failing.
 *
 * @param mission - The mission being looked at.
 * @param watcher - The unit doing the looking.
 * @param at - The position being looked at.
 * @param index - Tile index over `mission.map`, shared by the caller
 *   because a sight trace is the most expensive rule in the game.
 * @returns True when the watcher can see that position.
 */
export function unitCanSee(
  mission: TacticalState,
  watcher: Unit,
  at: GridPos,
  index: TileIndex,
): boolean {
  return (
    manhattanDistance(watcher.pos, at) <= sightRangeOf(mission, watcher) &&
    hasLineOfSight(mission.map, watcher.pos, at, index)
  );
}

// ===========================================
// Computing
// ===========================================

/**
 * What `team` can see right now (ADR 0006 §2.1): every tile within any
 * living unit's `sightRange` that it has a clear line to, and every enemy
 * standing on one of them.
 *
 * ```
 *   for each living unit of the side:
 *     tiles within sightRange (manhattan) with hasLineOfSight ──► visible
 *   enemies standing on a visible tile ──────────────────────────► spotted
 * ```
 *
 * `explored` is not computed here; it only ever grows, so `withVision`
 * unions this result into what the side already had. Pure: reads the
 * mission and nothing else.
 */
export function computeVision(
  mission: TacticalState,
  team: Team,
  index: TileIndex = new TileIndex(mission.map),
): Pick<SideVision, "visible" | "spotted"> {
  const visible = new Set<VisionTileKey>();
  const watchers = mission.units.filter(
    (unit) => unit.team === team && unit.hp > 0,
  );
  for (const watcher of watchers) {
    const range = sightRangeOf(mission, watcher);
    // Only the diamond within range, column by column, rather than every
    // tile on the map: this runs on every move, and a sight trace is the
    // most expensive rule in the game (ADR 0006 §3). The loop bounds are
    // an optimisation over `unitCanSee`, not a second copy of it: the
    // predicate still decides every tile, so the two cannot disagree.
    for (let dx = -range; dx <= range; dx++) {
      const span = range - Math.abs(dx);
      for (let dz = -span; dz <= span; dz++) {
        for (const tile of index.column(
          watcher.pos.x + dx,
          watcher.pos.z + dz,
        )) {
          const key = index.keyOf(tile);
          if (visible.has(key)) {
            continue;
          }
          if (unitCanSee(mission, watcher, tile, index)) {
            visible.add(key);
          }
        }
      }
    }
  }
  const spotted: UnitId[] = [];
  for (const unit of mission.units) {
    if (unit.team === team || unit.hp <= 0) {
      continue;
    }
    if (visible.has(index.keyOf(unit.pos))) {
      spotted.push(unit.id);
    }
  }
  return { visible: [...visible], spotted };
}

// ===========================================
// Applying
// ===========================================

/**
 * Recomputes both sides' vision over an applied change and appends the
 * spotting events it produced (ADR 0006 §2.2). Wrapped around every
 * handler at the one site that already appends to the log, so no handler
 * computes vision itself and none can forget to.
 *
 * ```
 *   applied.state ──► computeVision per side ──► visible', spotted'
 *          explored' = explored ∪ visible'
 *          spotted' − spotted ──► UnitSpotted
 *          spotted − spotted' ──► UnitLost
 * ```
 *
 * Cheap enough because it runs on the events in §2.2 — a move, a death,
 * an extraction, a turn — and never per frame.
 */
export function withVision(
  applied: TacticalApplied<TacticalState>,
  before?: TacticalState,
): TacticalApplied<TacticalState> {
  const mission = applied.state;
  // Nothing that vision depends on moved, died or left, so nothing it
  // computes can have changed. Reloading, going on overwatch, planting
  // charges and a missed shot all land here, and on a map with sixty
  // bugs a full recompute costs about 40ms — too much to spend proving
  // that a reload changed nothing.
  if (before !== undefined && sameVantage(before, mission)) {
    return applied;
  }
  const index = new TileIndex(mission.map);
  const events: TacticalEvent[] = [];
  const vision: Record<Team, SideVision> = { ...mission.vision };
  for (const team of TEAMS_BY_VISION) {
    const before = mission.vision[team] ?? NO_VISION;
    const now = computeVision(mission, team, index);
    vision[team] = {
      visible: now.visible,
      spotted: now.spotted,
      explored: union(before.explored, now.visible),
      // Remembered, not recomputed (#716). A side keeps where it last
      // saw an enemy after losing sight of it, which is the difference
      // between a bug that breaks contact and one that has forgotten
      // there was ever anything to look for.
      lastSeen: rememberSeen(before.lastSeen, mission, now.spotted),
    };
    for (const unitId of now.spotted) {
      if (!before.spotted.includes(unitId)) {
        events.push({ type: UNIT_SPOTTED, payload: { team, unitId } });
      }
    }
    for (const unitId of before.spotted) {
      if (!now.spotted.includes(unitId)) {
        events.push({ type: UNIT_LOST, payload: { team, unitId } });
      }
    }
  }
  return {
    state: { ...mission, vision },
    events: [...applied.events, ...events],
  };
}

/**
 * Folds the positions of everything currently spotted into what this
 * side already remembered (#716).
 *
 * ```
 *   spotted now ──► position recorded, overwriting any older one
 *   not spotted ──► the old record survives untouched
 * ```
 *
 * Only positions of units this side can see right now are ever written,
 * so the memory cannot hold somewhere nobody looked (ADR 0006 §2.3). It
 * is never pruned: a record for a dead unit is harmless, because a
 * behaviour looking one up is asking "where should I go" rather than
 * "who is alive", and the answer stays honest either way.
 *
 * @param remembered - What the side knew before this recompute.
 * @param mission - The mission, for current positions.
 * @param spotted - Enemy ids visible to this side right now.
 * @returns The updated memory, or the same object when nothing is seen.
 */
function rememberSeen(
  remembered: Readonly<Record<UnitId, TileCoord>>,
  mission: TacticalState,
  spotted: readonly UnitId[],
): Readonly<Record<UnitId, TileCoord>> {
  if (spotted.length === 0) {
    return remembered;
  }
  const next: Record<UnitId, TileCoord> = { ...remembered };
  for (const unitId of spotted) {
    const unit = mission.units.find((u) => u.id === unitId);
    if (unit !== undefined) {
      next[unitId] = unit.pos;
    }
  }
  return next;
}

/**
 * The vision a mission starts with: both sides look once from where they
 * deployed, so the first frame is already fogged correctly rather than
 * blank until someone moves.
 */
export function initialVision(
  mission: Omit<TacticalState, "vision">,
): Readonly<Record<Team, SideVision>> {
  const seeded: TacticalState = { ...mission, vision: emptyVision() };
  return withVision({ state: seeded, events: [] }).state.vision;
}

/** No knowledge for either side. */
export function emptyVision(): Record<Team, SideVision> {
  return { tdf: NO_VISION, bugs: NO_VISION };
}

// ===========================================
// Helpers
// ===========================================

/**
 * Whether two missions present the same vantage: the same units, alive or
 * not in the same way, standing in the same places. Those are the only
 * things vision reads, so anything else — health, action points, status,
 * charges — can differ freely without changing what a side can see.
 */
function sameVantage(before: TacticalState, after: TacticalState): boolean {
  if (before.units.length !== after.units.length) {
    return false;
  }
  for (let i = 0; i < before.units.length; i++) {
    const a = before.units[i];
    const b = after.units[i];
    if (b === undefined || !sameVantageUnit(a, b)) {
      return false;
    }
  }
  return true;
}

/**
 * Whether one unit presents the same vantage in both missions. Vision
 * reads life, not health: a shot that hurts without killing changes
 * nothing about who can see what, and most shots are that.
 */
function sameVantageUnit(a: Unit | undefined, b: Unit): boolean {
  if (a === undefined) {
    return false;
  }
  return (
    a.id === b.id &&
    a.hp > 0 === b.hp > 0 &&
    a.pos.x === b.pos.x &&
    a.pos.y === b.pos.y &&
    a.pos.z === b.pos.z
  );
}

/** The union of two key lists, as a fresh sorted array so a save is stable. */
function union(
  a: readonly VisionTileKey[],
  b: readonly VisionTileKey[],
): VisionTileKey[] {
  const all = new Set<VisionTileKey>(a);
  for (const key of b) {
    all.add(key);
  }
  return [...all].sort((x, y) => x - y);
}

/**
 * Whether a *side* has a unit spotted right now, read from the stored
 * vision rather than traced (ADR 0006 §2.1).
 *
 * Not the same question as `unitCanSee`, which asks whether one
 * particular unit has eyes on a position. This one is side knowledge —
 * what the renderer may draw and what a behaviour may know; that one is
 * a single watcher's line of sight, which is what decides whether a
 * given gun has a shot. Keep them apart: the day they are conflated is
 * the day a unit fires at something only its teammate can see.
 */
export function canSee(
  mission: TacticalState,
  team: Team,
  unitId: UnitId,
): boolean {
  return (mission.vision[team]?.spotted ?? []).includes(unitId);
}

/**
 * The egg spawners a side has laid eyes on: those standing on a tile in
 * its `explored` set. A spawner is a fixed feature of the map, so once
 * seen it stays known even when nothing is looking at it — unlike a
 * unit, which is drawn only while `spotted`.
 *
 * Without this the renderer draws every spawner from the first frame,
 * which hangs the mission's objectives in mid-air over unexplored black
 * and tells the player where to go before they have scouted (#551).
 */
export function perceivedSpawners(
  mission: TacticalState,
  team: Team,
  index: TileIndex = new TileIndex(mission.map),
): readonly Spawner[] {
  const explored = new Set(mission.vision[team]?.explored ?? []);
  return mission.spawners.filter((spawner) =>
    explored.has(index.keyOf(spawner.pos)),
  );
}

/** Every unit of `team`, plus the enemies it can see. */
export function perceivedUnits(
  mission: TacticalState,
  team: Team,
): readonly Unit[] {
  const spotted = new Set(mission.vision[team]?.spotted ?? []);
  return mission.units.filter(
    (unit) => unit.team === team || spotted.has(unit.id),
  );
}

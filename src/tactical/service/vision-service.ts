import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type {
  SideVision,
  TacticalState,
  VisionTileKey,
} from "../model/tactical-state";
import { NO_VISION, TEAMS_BY_VISION } from "../model/tactical-state";
import type { Team, Unit, UnitId } from "../model/unit";
import { UNIT_LOST } from "../model/unit-lost-event";
import { UNIT_SPOTTED } from "../model/unit-spotted-event";
import { hasLineOfSight } from "./sight-service";

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
    const range = mission.templates[watcher.templateId]?.sightRange ?? 0;
    // Only the diamond within range, column by column, rather than every
    // tile on the map: this runs on every move, and a sight trace is the
    // most expensive rule in the game (ADR 0006 §3).
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
          if (hasLineOfSight(mission.map, watcher.pos, tile, index)) {
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
): TacticalApplied<TacticalState> {
  const mission = applied.state;
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

/** Whether a side can see a unit right now. */
export function canSee(
  mission: TacticalState,
  team: Team,
  unitId: UnitId,
): boolean {
  return (mission.vision[team]?.spotted ?? []).includes(unitId);
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

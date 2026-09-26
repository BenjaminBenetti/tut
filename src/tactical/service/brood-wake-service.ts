import { ok } from "../../core/model/result";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import { BLAST_RESOLVED } from "../model/blast-resolved-event";
import type {
  Brood,
  BroodId,
  BroodWakeCause,
  BroodWakeZone,
} from "../model/brood";
import type { BroodWakeTuning } from "../model/brood-tuning";
import { BROOD_WOKE } from "../model/brood-woke-event";
import { EFFECT_STARTED } from "../model/effect-started-event";
import type { PhaseStep } from "../model/phase-step";
import type { TacticalCommandType } from "../model/tactical-command";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { isDormant } from "../model/unit";
import { UNIT_MOVED } from "../model/unit-moved-event";
import { UNIT_STATUS_CHANGED } from "../model/unit-status-changed-event";
import { footprintSizeOf, footprintTiles } from "./footprint-service";
import { noiseOf } from "./noise-service";
import type { TacticalHandlers } from "./tactical-command-handlers";

// ===========================================
// Waking after a change
// ===========================================

/**
 * Wakes every sleeping brood the change `before → applied` disturbed
 * (#1179, campaign arc §7.5), all of each brood at once. Deterministic
 * and draws nothing from the RNG: it reads hit points and events that
 * already happened, so wrapping a rule in it leaves that rule's draws
 * exactly where they were.
 *
 * ```
 *   for brood of broods (table order), still asleep:
 *     a member lost hit points (any source)                          ──► attack
 *     else the first event, in order, that
 *       moved a squad-side unit so a tile of it ends a step in the zone ──► enter
 *       was a squad-side shot at a unit or spawner in the zone          ──► attack
 *       was a squad-side blast whose reach overlaps the zone            ──► attack
 *       was a squad-side fire lit in the zone                           ──► attack
 *       was a squad-side loud noise within radius + noiseRadius         ──► noise
 *   woken: members lose `dormant`, brood.woke = { turn, phase, cause },
 *          one BroodWoke each, appended after the change's own events
 *   a dormant bug outside any brood that lost hit points wakes alone,
 *   announced by UnitStatusChanged
 * ```
 *
 * The zone is Euclidean on the ground plane (`BroodWakeZone`). "Squad
 * side" is any unit not on the bugs' team — squads, mechs, turrets:
 * bugs neither step nor shout their kin awake, though a bug's blow that
 * lands on a sleeper still wakes it, since hurt is hurt.
 *
 * Returns `applied` itself when nothing woke, and when nothing was
 * asleep to start with — every mission but a hive cavern's — without
 * reading the events at all.
 *
 * @param before - The mission the change was applied to.
 * @param applied - The change: the mission after it and the events it emitted.
 * @param tuning - How far a brood hears.
 * @returns The change with the broods it woke awake and announced.
 */
export function wakeBroods(
  before: TacticalState,
  applied: TacticalApplied<TacticalState>,
  tuning: BroodWakeTuning,
): TacticalApplied<TacticalState> {
  if (!hasSleepers(before) && !hasSleepers(applied.state)) {
    return applied;
  }
  const after = applied.state;
  const causes = new Map<BroodId, BroodWakeCause>();
  for (const brood of after.broods ?? []) {
    if (brood.woke !== undefined || !stillAsleep(after, brood)) {
      continue;
    }
    const cause = wakeCause(brood, before, applied, tuning);
    if (cause !== undefined) {
      causes.set(brood.id, cause);
    }
  }
  const lone = hurtLoneSleepers(before, after);
  if (causes.size === 0 && lone.length === 0) {
    return applied;
  }
  const woken = wake(after, causes, lone);
  return {
    state: woken.state,
    events: [...applied.events, ...woken.events],
  };
}

/**
 * Wakes one brood now, for `cause`, whatever woke it: the scripted path
 * a mission rule takes (a hive core that screams when struck, say).
 * A brood that is already awake, or unknown, leaves the mission as it
 * was with no event.
 *
 * @param mission - The mission in progress.
 * @param broodId - The brood to wake.
 * @param cause - What the `BroodWoke` event reports.
 * @returns The mission with the brood awake, and its `BroodWoke`.
 */
export function wakeBrood(
  mission: TacticalState,
  broodId: BroodId,
  cause: BroodWakeCause,
): TacticalApplied<TacticalState> {
  const brood = mission.broods?.find((entry) => entry.id === broodId);
  if (brood === undefined || brood.woke !== undefined) {
    return { state: mission, events: [] };
  }
  return wake(mission, new Map([[broodId, cause]]), []);
}

// ===========================================
// Decorators
// ===========================================

/**
 * A handler that wakes the broods its command disturbed: the rule runs
 * as before, then `wakeBroods` reads what it did. A refusal passes
 * through untouched.
 *
 * @param handler - The rule to wrap.
 * @param tuning - How far a brood hears.
 * @returns The wrapped handler.
 */
export function withBroodWaking(
  handler: TacticalHandler,
  tuning: BroodWakeTuning,
): TacticalHandler {
  return (mission, command, ctx) => {
    const outcome = handler(mission, command, ctx);
    if (!outcome.ok) {
      return outcome;
    }
    const woken = wakeBroods(mission, outcome.value, tuning);
    return woken === outcome.value ? outcome : ok(woken);
  };
}

/**
 * Every handler of `handlers` wrapped by `withBroodWaking`: the action
 * rules the squad, the bug phase and the Jev driver all apply through,
 * so a brood wakes the moment a command disturbs it, wherever the
 * command came from. `EndTurn` is not meant for this; its effects reach
 * the broods through the wrapped phase steps (`wakingStep`).
 *
 * @param handlers - The action handlers.
 * @param tuning - How far a brood hears.
 * @returns The same handlers, each waking broods after it applies.
 */
export function withBroodWakingAll(
  handlers: TacticalHandlers,
  tuning: BroodWakeTuning,
): TacticalHandlers {
  const wrapped: Partial<Record<TacticalCommandType, TacticalHandler>> = {};
  for (const type of Object.keys(handlers) as TacticalCommandType[]) {
    const handler = handlers[type];
    if (handler !== undefined) {
      // The mapped type pairs each key with its own command's handler;
      // the wrapper passes the command through untouched, so widening
      // to the union and back is safe.
      wrapped[type] = withBroodWaking(handler as TacticalHandler, tuning);
    }
  }
  return wrapped;
}

/**
 * A phase step that wakes the broods it disturbed: a fire burning a
 * sleeper as the bug phase opens, a charge going off beside a chamber.
 *
 * @param step - The phase step to wrap.
 * @param tuning - How far a brood hears.
 * @returns The wrapped step.
 */
export function wakingStep(
  step: PhaseStep,
  tuning: BroodWakeTuning,
): PhaseStep {
  return (mission, ctx) => wakeBroods(mission, step(mission, ctx), tuning);
}

// ===========================================
// Zones
// ===========================================

/**
 * Whether `tile` is within `margin` tiles of the wake zone: Euclidean on
 * the ground plane, height ignored (`BroodWakeZone`).
 *
 * @param zone - The brood's wake zone.
 * @param tile - Any tile.
 * @param margin - Tiles beyond the zone's edge that still count; 0 for the zone itself.
 * @returns True when `dx² + dz² ≤ (radius + margin)²`.
 */
export function withinWakeZone(
  zone: BroodWakeZone,
  tile: TileCoord,
  margin = 0,
): boolean {
  const dx = tile.x - zone.centre.x;
  const dz = tile.z - zone.centre.z;
  const reach = zone.radius + margin;
  return dx * dx + dz * dz <= reach * reach;
}

// ===========================================
// Causes
// ===========================================

/** What woke `brood` in this change, or undefined when it slept through it. */
function wakeCause(
  brood: Brood,
  before: TacticalState,
  applied: TacticalApplied<TacticalState>,
  tuning: BroodWakeTuning,
): BroodWakeCause | undefined {
  const after = applied.state;
  if (membersHurt(brood, before, after)) {
    return "attack";
  }
  for (const event of applied.events) {
    const cause = eventCause(event, brood.wake, after, tuning);
    if (cause !== undefined) {
      return cause;
    }
  }
  return undefined;
}

/** What one event did to the zone: entered, attacked, heard, or nothing. */
function eventCause(
  event: TacticalEvent,
  zone: BroodWakeZone,
  mission: TacticalState,
  tuning: BroodWakeTuning,
): BroodWakeCause | undefined {
  switch (event.type) {
    case UNIT_MOVED: {
      const mover = findUnit(mission, event.payload.unitId);
      if (mover === undefined || mover.team === "bugs") {
        return undefined;
      }
      const size = footprintSizeOf(mission.templates[mover.templateId] ?? {});
      return footprintTiles(event.payload.to, size).some((tile) =>
        withinWakeZone(zone, tile),
      )
        ? "enter"
        : undefined;
    }
    case ATTACK_RESOLVED:
      if (!squadSide(mission, event.payload.attackerId)) {
        return undefined;
      }
      if (
        targetTiles(mission, event.payload.targetId).some((tile) =>
          withinWakeZone(zone, tile),
        )
      ) {
        return "attack";
      }
      break;
    case BLAST_RESOLVED: {
      const blast = event.payload;
      if (!squadSide(mission, blast.attackerId)) {
        return undefined;
      }
      if (
        blast.hit &&
        blast.smoke !== true &&
        withinWakeZone(zone, blast.impact, blast.radius)
      ) {
        return "attack";
      }
      break;
    }
    case EFFECT_STARTED:
      return squadSide(mission, event.payload.unitId) &&
        withinWakeZone(zone, event.payload.tile)
        ? "attack"
        : undefined;
    default:
      return undefined;
  }
  const noise = noiseOf(event, mission, tuning);
  return noise !== undefined &&
    squadSide(mission, noise.by) &&
    withinWakeZone(zone, noise.at, tuning.noiseRadius)
    ? "noise"
    : undefined;
}

/** Whether any member of the brood has fewer hit points after the change than before it. */
function membersHurt(
  brood: Brood,
  before: TacticalState,
  after: TacticalState,
): boolean {
  return brood.memberIds.some((memberId) => {
    const was = findUnit(before, memberId);
    const now = findUnit(after, memberId);
    return was !== undefined && now !== undefined && now.hp < was.hp;
  });
}

/** Dormant bugs in no brood that were hurt by the change: each wakes alone. */
function hurtLoneSleepers(
  before: TacticalState,
  after: TacticalState,
): readonly UnitId[] {
  const inBroods = new Set(
    (after.broods ?? []).flatMap((brood) => brood.memberIds),
  );
  const hurt: UnitId[] = [];
  for (const unit of after.units) {
    if (!isDormant(unit) || inBroods.has(unit.id)) {
      continue;
    }
    const was = findUnit(before, unit.id);
    if (was !== undefined && unit.hp < was.hp) {
      hurt.push(unit.id);
    }
  }
  return hurt;
}

// ===========================================
// Waking
// ===========================================

/**
 * Takes `dormant` off every member of the broods in `causes` and off
 * the lone sleepers, stamps each brood's `woke`, and announces them:
 * one `BroodWoke` per brood in table order, then one
 * `UnitStatusChanged` per lone bug.
 */
function wake(
  mission: TacticalState,
  causes: ReadonlyMap<BroodId, BroodWakeCause>,
  lone: readonly UnitId[],
): TacticalApplied<TacticalState> {
  const broods = mission.broods ?? [];
  const waking = new Set<UnitId>(lone);
  for (const brood of broods) {
    if (causes.has(brood.id)) {
      brood.memberIds.forEach((memberId) => waking.add(memberId));
    }
  }
  const units = mission.units.map((unit) =>
    waking.has(unit.id) && isDormant(unit)
      ? { ...unit, status: unit.status.filter((entry) => entry !== "dormant") }
      : unit,
  );
  const events: TacticalEvent[] = [];
  const stamped = broods.map((brood): Brood => {
    const cause = causes.get(brood.id);
    if (cause === undefined) {
      return brood;
    }
    events.push({
      type: BROOD_WOKE,
      payload: {
        broodId: brood.id,
        cause,
        ...(brood.label === undefined ? {} : { label: brood.label }),
        unitIds: brood.memberIds,
      },
    });
    return {
      ...brood,
      woke: { turn: mission.turn, phase: mission.phase, cause },
    };
  });
  for (const unitId of lone) {
    const unit = units.find((entry) => entry.id === unitId);
    if (unit !== undefined) {
      events.push({
        type: UNIT_STATUS_CHANGED,
        payload: { unitId, status: unit.status },
      });
    }
  }
  return {
    state: {
      ...mission,
      units,
      ...(mission.broods === undefined ? {} : { broods: stamped }),
    },
    events,
  };
}

// ===========================================
// Helpers
// ===========================================

/** Whether any living unit of the mission is dormant. */
function hasSleepers(mission: TacticalState): boolean {
  return mission.units.some((unit) => unit.hp > 0 && isDormant(unit));
}

/**
 * Whether a brood still has a member asleep: one killed in its sleep by
 * this very change counts, so a brood whose last sleeper died of the
 * blow still wakes (and records why) with nobody left to act.
 */
function stillAsleep(mission: TacticalState, brood: Brood): boolean {
  return brood.memberIds.some((memberId) => {
    const unit = findUnit(mission, memberId);
    return unit !== undefined && isDormant(unit);
  });
}

/**
 * Whether the unit is on the squad's side: any team but the bugs'. A
 * unit that has left through the extraction still owns what it set
 * off (a charge's blast names its owner). An unknown id is nobody's.
 */
function squadSide(mission: TacticalState, unitId: UnitId): boolean {
  const unit =
    findUnit(mission, unitId) ??
    mission.extracted.find((entry) => entry.id === unitId);
  return unit !== undefined && unit.team !== "bugs";
}

/** The tiles a shot's target stands on: a unit's footprint, a spawner's tile, or none. */
function targetTiles(mission: TacticalState, targetId: string): TileCoord[] {
  const unit = findUnit(mission, targetId);
  if (unit !== undefined) {
    const size = footprintSizeOf(mission.templates[unit.templateId] ?? {});
    return footprintTiles(unit.pos, size);
  }
  const spawner = mission.spawners.find((entry) => entry.id === targetId);
  return spawner === undefined ? [] : [spawner.pos];
}

/** The unit with the id, if it is in the mission. */
function findUnit(mission: TacticalState, unitId: UnitId): Unit | undefined {
  return mission.units.find((unit) => unit.id === unitId);
}

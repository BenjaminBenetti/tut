import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { allows } from "../../mapgen/model/pass-mask";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { BurrowTuning } from "../model/burrow-tuning";
import type {
  BurrowRejection,
  MoveRejection,
  TacticalError,
} from "../model/tactical-error";
import type { TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { isBurrowed, passMaskFor } from "../model/unit";
import { MELEE_RANGE } from "../model/weapon-profile";
import { unitFootprintTiles } from "./footprint-service";
import { apCostOf, occupiedKeys } from "./movement-service";
import {
  groundTileAt,
  isDiggable,
  searchTunnel,
  tunnelHeldKeys,
} from "./tunnel-service";
import { attackDistance } from "./weapon-reach-service";

// ===========================================
// Types
// ===========================================

/** A tunnel the rules allow: who digs, from and to which ground tile, and what it costs. */
export interface CheckedTunnel {
  readonly unit: Unit;
  readonly to: Tile;
  /** Action points it spends. */
  readonly apCost: number;
}

/** A surfacing or a dive the rules allow, and the tile it happens on. */
export interface CheckedBurrowAction {
  readonly unit: Unit;
  readonly tile: Tile;
}

// ===========================================
// Validation
// ===========================================
//
// The three orders a burrower takes (#1179), each checked here and
// applied by its own handler. Every one opens with the same questions
// about the unit, in the order `actingUnit` asks them, except that the
// burrow status is the point of the order rather than a bar to it:
//
//   unit missing ──► unit-not-on-map     down ──► unit-dead
//   template does not dig ──► illegal-burrow (not-a-burrower)
//   Tunnel / Surface on the surface ──► illegal-burrow (not-burrowed)
//   Burrow while under the ground ────► illegal-burrow (already-burrowed)
//   not its side's phase ──► wrong-phase   too few actions ──► no-action-points

/**
 * Checks a `Tunnel` (#1179): a burrowed digger, in its side's phase,
 * ending on a ground tile `searchTunnel` reaches within its budget that
 * nothing holds (`tunnelHeldKeys`). It pays for the columns crossed as a
 * walk pays for its steps (`apCostOf`).
 *
 * ```
 *   unit checks (above) ──► …
 *   to is where it already is ──────► illegal-move (empty-path)
 *   to off the map / not a ground tile / out of reach ──► illegal-move (unreachable)
 *   to held by a unit or a live spawner ──► illegal-burrow (tile-held)
 * ```
 *
 * @param mission - The mission.
 * @param unitId - The burrower.
 * @param to - The ground tile it wants to end on.
 * @param index - The map's tile index; built when not given.
 * @returns The checked tunnel, or why it is refused.
 */
export function validateTunnel(
  mission: TacticalState,
  unitId: UnitId,
  to: TileCoord,
  index: TileIndex = new TileIndex(mission.map),
): Result<CheckedTunnel, TacticalError> {
  const checked = diggerUnder(mission, unitId, true, 0);
  if (!checked.ok) {
    return checked;
  }
  const unit = checked.value;
  const reject = (reason: MoveRejection): Result<never, TacticalError> =>
    err({ kind: "illegal-move", unitId, reason });
  const origin = groundTileAt(index, unit.pos.x, unit.pos.z);
  if (origin?.x === to.x && origin.z === to.z) {
    return reject("empty-path");
  }
  const tile = index.inBounds(to) ? index.getAt(to) : undefined;
  if (tile === undefined) {
    return reject("unreachable");
  }
  const key = index.keyOf(tile);
  const search = searchTunnel(mission, unit, index);
  const cost = search.costs.get(key);
  if (cost === undefined) {
    return reject("unreachable");
  }
  if (tunnelHeldKeys(mission, index, unitId).has(key)) {
    return burrowRefusal(unitId, "tile-held");
  }
  return ok({ unit, to: tile, apCost: apCostOf(mission, unit, cost) });
}

/**
 * Checks a `Surface` (#1179): a burrowed digger with the action points
 * for it, under ground a unit of its class may stand on that no other
 * living unit or live egg spawner holds. Where it may come up at all is
 * `canSurfaceOn`, which the bugs' behaviour asks before it digs there.
 *
 * ```
 *   unit checks (above) ──► …
 *   the tile above admits no infantry ──► illegal-burrow (no-footing)
 *   someone stands on it ───────────────► illegal-burrow (tile-held)
 * ```
 *
 * @param mission - The mission.
 * @param unitId - The burrower.
 * @param tuning - What coming up costs.
 * @param index - The map's tile index; built when not given.
 * @returns The unit and the tile it comes up on, or why it cannot.
 */
export function validateSurface(
  mission: TacticalState,
  unitId: UnitId,
  tuning: BurrowTuning,
  index: TileIndex = new TileIndex(mission.map),
): Result<CheckedBurrowAction, TacticalError> {
  const checked = diggerUnder(mission, unitId, true, tuning.surfaceApCost);
  if (!checked.ok) {
    return checked;
  }
  const unit = checked.value;
  const tile = index.getAt(unit.pos);
  if (tile === undefined || !allows(tile.pass, passMaskFor(unit.passClass))) {
    return burrowRefusal(unitId, "no-footing");
  }
  if (surfaceHeld(mission, tile, index, unitId)) {
    return burrowRefusal(unitId, "tile-held");
  }
  return ok({ unit, tile });
}

/**
 * Checks a `Burrow` (#1179): a surfaced digger with the action points
 * for it, whose cooldown since it last came up has run, standing on its
 * column's ground tile — not a floor or a roof — over earth it can dig.
 *
 * ```
 *   unit checks (above) ──► …
 *   came up fewer than reburrowCooldownTurns turns ago ──► illegal-burrow (cooldown)
 *   standing above the ground, or on water or bedrock ──► illegal-burrow (hard-ground)
 * ```
 *
 * @param mission - The mission.
 * @param unitId - The burrower.
 * @param tuning - What going down costs, and the cooldown.
 * @param index - The map's tile index; built when not given.
 * @returns The unit and the tile it goes down through, or why it cannot.
 */
export function validateBurrow(
  mission: TacticalState,
  unitId: UnitId,
  tuning: BurrowTuning,
  index: TileIndex = new TileIndex(mission.map),
): Result<CheckedBurrowAction, TacticalError> {
  const checked = diggerUnder(mission, unitId, false, tuning.burrowApCost);
  if (!checked.ok) {
    return checked;
  }
  const unit = checked.value;
  if (!burrowCooldownOver(unit, mission.turn, tuning)) {
    return burrowRefusal(unitId, "cooldown");
  }
  const ground = groundTileAt(index, unit.pos.x, unit.pos.z);
  if (ground?.y !== unit.pos.y || !isDiggable(ground)) {
    return burrowRefusal(unitId, "hard-ground");
  }
  return ok({ unit, tile: ground });
}

// ===========================================
// Queries
// ===========================================

/**
 * Whether a burrower could come up on `tile`: a unit of its class may
 * stand there and nothing else does (`surfaceHeld`). The half of
 * `validateSurface` about the ground rather than the unit, for a
 * behaviour choosing where to dig to before it asks.
 *
 * @param mission - The mission, or a side's view of it.
 * @param unit - The burrower.
 * @param tile - The ground tile it would come up on.
 * @param index - The map's tile index.
 * @returns Whether surfacing there would be allowed.
 */
export function canSurfaceOn(
  mission: TacticalState,
  unit: Unit,
  tile: Tile,
  index: TileIndex,
): boolean {
  return (
    allows(tile.pass, passMaskFor(unit.passClass)) &&
    !surfaceHeld(mission, tile, index, unit.id)
  );
}

/**
 * Whether the unit's cooldown since it last surfaced has run: it may
 * dig once `turn ≥ surfacedOnTurn + reburrowCooldownTurns`. A unit that
 * has never surfaced may dig at once.
 *
 * @param unit - The burrower.
 * @param turn - The mission's current turn.
 * @param tuning - The cooldown.
 * @returns Whether it may burrow on this turn.
 */
export function burrowCooldownOver(
  unit: Pick<Unit, "surfacedOnTurn">,
  turn: number,
  tuning: BurrowTuning,
): boolean {
  return (
    unit.surfacedOnTurn === undefined ||
    turn >= unit.surfacedOnTurn + tuning.reburrowCooldownTurns
  );
}

/**
 * The living, unburrowed enemies within arm's reach of `pos`, in
 * `units` order: who a burrower surfacing there comes up beside. A unit
 * on a block (#1130) counts when any tile of it is in reach.
 *
 * @param mission - The mission.
 * @param unit - The burrower.
 * @param pos - The tile it comes up on.
 * @returns The ids beside it.
 */
export function enemiesBeside(
  mission: TacticalState,
  unit: Unit,
  pos: TileCoord,
): UnitId[] {
  return mission.units
    .filter(
      (other) =>
        other.team !== unit.team &&
        other.hp > 0 &&
        !isBurrowed(other) &&
        unitFootprintTiles(mission, other).some(
          (tile) => attackDistance(pos, tile) <= MELEE_RANGE,
        ),
    )
    .map((other) => other.id);
}

// ===========================================
// Helpers
// ===========================================

/**
 * The shared opening of all three orders: the unit exists and stands,
 * digs at all, is under the ground or not as the order needs, and it
 * is its side's phase with `apCost` action points to spend.
 */
function diggerUnder(
  mission: TacticalState,
  unitId: UnitId,
  burrowed: boolean,
  apCost: number,
): Result<Unit, TacticalError> {
  const unit = mission.units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) {
    return err({ kind: "unit-not-on-map", unitId });
  }
  if (unit.hp <= 0) {
    return err({ kind: "unit-dead", unitId });
  }
  if (mission.templates[unit.templateId]?.burrows !== true) {
    return burrowRefusal(unitId, "not-a-burrower");
  }
  if (isBurrowed(unit) !== burrowed) {
    return burrowRefusal(
      unitId,
      burrowed ? "not-burrowed" : "already-burrowed",
    );
  }
  if (unit.team !== TEAM_FOR_PHASE[mission.phase]) {
    return err({ kind: "wrong-phase", unitId });
  }
  if (unit.ap < apCost) {
    return err({ kind: "no-action-points", unitId });
  }
  return ok(unit);
}

/**
 * Whether something stands on `tile` that a burrower cannot come up
 * through: a living unit on the surface other than the burrower itself,
 * or a live egg spawner.
 */
function surfaceHeld(
  mission: TacticalState,
  tile: Tile,
  index: TileIndex,
  except: UnitId,
): boolean {
  const key = index.keyOf(tile);
  return (
    occupiedKeys(mission, index, except).has(key) ||
    mission.spawners.some(
      (spawner) =>
        !spawner.destroyed &&
        index.inBounds(spawner.pos) &&
        index.keyOf(spawner.pos) === key,
    )
  );
}

/** An `illegal-burrow` refusal for the unit. */
function burrowRefusal(
  unitId: UnitId,
  reason: BurrowRejection,
): Result<never, TacticalError> {
  return err({ kind: "illegal-burrow", unitId, reason });
}

import { err, ok } from "../../core/model/result";
import type { Result } from "../../core/model/result";
import { manhattanDistance } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { CarriedSpecimen } from "../model/carried-specimen";
import { canCarrySpecimen } from "../model/carried-specimen";
import { SPECIMEN_PICKED_UP } from "../model/specimen-picked-up-event";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalApplied } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import type { Team, Unit, UnitId } from "../model/unit";

// ===========================================
// Types
// ===========================================

/**
 * A specimen lying on the ground (#1179): the one a carrier was holding
 * when it fell. It is the fallen carrier's record that still holds it,
 * so it lies on that unit's tile and is named by that unit's id.
 */
export interface DroppedSpecimen {
  /** The fallen carrier; its id names the dropped specimen too. */
  readonly carrierId: UnitId;
  /** Where it lies: the tile the carrier fell on. */
  readonly pos: TileCoord;
  readonly specimen: CarriedSpecimen;
}

// ===========================================
// Queries
// ===========================================

/**
 * Every living unit on the map carrying a specimen (#1179), of
 * `species` when given, in unit order.
 *
 * @param mission - The mission.
 * @param species - Only carriers of this species; every carrier when absent.
 * @returns The carriers.
 */
export function specimenCarriers(
  mission: TacticalState,
  species?: string,
): readonly Unit[] {
  return mission.units.filter(
    (unit) =>
      unit.hp > 0 &&
      unit.carrying !== undefined &&
      (species === undefined || unit.carrying.species === species),
  );
}

/**
 * Every specimen lying where its carrier fell (#1179), of `species` when
 * given, in unit order.
 *
 * @param mission - The mission.
 * @param species - Only specimens of this species; every one when absent.
 * @returns The dropped specimens.
 */
export function droppedSpecimens(
  mission: TacticalState,
  species?: string,
): readonly DroppedSpecimen[] {
  return mission.units.flatMap((unit): DroppedSpecimen[] =>
    unit.hp <= 0 &&
    unit.carrying !== undefined &&
    (species === undefined || unit.carrying.species === species)
      ? [{ carrierId: unit.id, pos: unit.pos, specimen: unit.carrying }]
      : [],
  );
}

/**
 * The dropped specimens on ground `team` has explored (#1179), the way
 * `perceivedCarcasses` answers for carcasses: a specimen lies still, so
 * once seen it stays known. The scene draws only these (ADR 0006 §2.4).
 * A carrier falls on ground its own side was standing on, so for the
 * player this is every dropped specimen; the filter is what keeps it so.
 *
 * @param mission - The mission.
 * @param team - The side looking.
 * @param index - The map's tile index, when the caller already has one.
 * @returns The dropped specimens that side knows of.
 */
export function perceivedSpecimens(
  mission: TacticalState,
  team: Team,
  index: TileIndex = new TileIndex(mission.map),
): readonly DroppedSpecimen[] {
  const explored = new Set(mission.vision[team]?.explored ?? []);
  return droppedSpecimens(mission).filter((dropped) =>
    explored.has(index.keyOf(dropped.pos)),
  );
}

/**
 * Whether a specimen of `species` has gone home (#1179): a unit that
 * left through the extraction zone was carrying one.
 *
 * @param mission - The mission.
 * @param species - The species wanted.
 * @returns True once one is out.
 */
export function specimenExtracted(
  mission: TacticalState,
  species: string,
): boolean {
  return mission.extracted.some((unit) => unit.carrying?.species === species);
}

// ===========================================
// Picking up
// ===========================================

/**
 * Why `unit` cannot take a specimen into its hands (#1179), or
 * undefined when it can. The pick-up, the net and the capture's
 * `reachable` all ask this one question, so none offers what another
 * refuses.
 *
 * ```
 *   not a kind that carries (a mech, a civilian group, …) ──► cannot-carry
 *   hands already full                                     ──► already-carrying
 *   otherwise                                              ──► undefined
 * ```
 *
 * @param unit - The unit that would take one.
 * @returns The refusal, or undefined.
 */
export function carryRefusal(
  unit: Pick<Unit, "id" | "kind" | "carrying">,
): TacticalError | undefined {
  if (!canCarrySpecimen(unit)) {
    return { kind: "cannot-carry", unitId: unit.id };
  }
  if (unit.carrying !== undefined) {
    return { kind: "already-carrying", unitId: unit.id };
  }
  return undefined;
}

/**
 * Picks up a dropped specimen of `species` within `range` of the unit
 * (#1179): the nearest, first in unit order on a tie. The specimen moves
 * from the fallen carrier's record to the unit's, and the unit carries
 * it on from there at its movement cost.
 *
 * ```
 *   unit    ──► cannot-carry (not a squad) · already-carrying
 *   ground  ──► objective-target-missing (none of the species lies anywhere)
 *           ──► objective-out-of-reach   (the nearest is beyond range, manhattan)
 *   ok      ──► fallen.carrying removed, unit.carrying = specimen,
 *               SpecimenPickedUp { unitId, fromUnitId, specimen, pos }
 * ```
 *
 * Billing the action point is the caller's: this is an objective's
 * interaction, and the `Interact` handler bills.
 *
 * @param mission - The mission.
 * @param unit - The squad picking it up.
 * @param species - The species the objective wants.
 * @param range - Manhattan tiles the unit may reach.
 * @param objectiveId - The objective asking, for its refusals.
 * @returns The mission with the specimen carried again, or the refusal.
 */
export function pickUpSpecimen(
  mission: TacticalState,
  unit: Unit,
  species: string,
  range: number,
  objectiveId: string,
): Result<TacticalApplied<TacticalState>, TacticalError> {
  const refused = carryRefusal(unit);
  if (refused !== undefined) {
    return err(refused);
  }
  const nearest = nearestDropped(droppedSpecimens(mission, species), unit.pos);
  if (nearest === undefined) {
    return err({
      kind: "objective-target-missing",
      objectiveId,
      targetId: species,
    });
  }
  const distance = manhattanDistance(unit.pos, nearest.pos);
  if (distance > range) {
    return err({
      kind: "objective-out-of-reach",
      objectiveId,
      distance,
      range,
    });
  }
  const units = mission.units.map((candidate): Unit => {
    if (candidate.id === nearest.carrierId) {
      const { carrying: _dropped, ...fallen } = candidate;
      return fallen;
    }
    return candidate.id === unit.id
      ? { ...candidate, carrying: nearest.specimen }
      : candidate;
  });
  return ok({
    state: { ...mission, units },
    events: [
      {
        type: SPECIMEN_PICKED_UP,
        payload: {
          unitId: unit.id,
          fromUnitId: nearest.carrierId,
          specimen: nearest.specimen,
          pos: nearest.pos,
        },
      },
    ],
  });
}

// ===========================================
// Helpers
// ===========================================

/**
 * The dropped specimen nearest `from` by manhattan distance; the first
 * on a tie. The one a pick-up from `from` would take.
 *
 * @param dropped - The specimens lying on the map.
 * @param from - Where the unit stands.
 * @returns The nearest, or undefined when none lies anywhere.
 */
export function nearestDropped(
  dropped: readonly DroppedSpecimen[],
  from: TileCoord,
): DroppedSpecimen | undefined {
  let best: DroppedSpecimen | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of dropped) {
    const distance = manhattanDistance(from, candidate.pos);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

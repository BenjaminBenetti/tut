import type { BugSpeciesId } from "../../content/model/bug-species-id";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import { LAYER_TILES } from "../../core/model/elevation";
import { err, ok } from "../../core/model/result";
import type { Result } from "../../core/model/result";
import { chebyshevDistance } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { CarriedSpecimen } from "../model/carried-specimen";
import { canCarrySpecimen } from "../model/carried-specimen";
import type { EquipmentDefinition, NetProfile } from "../model/equipment";
import { SPECIMEN_CAPTURED } from "../model/specimen-captured-event";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalApplied } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import {
  footprintContains,
  footprintTiles,
  unitFootprintSize,
} from "./footprint-service";
import { hasLineOfSight } from "./sight-service";
import { canSee } from "./vision-service";

// ===========================================
// Types
// ===========================================

/** A net throw the rules accept (#1179): the bug it lands on and the tile it is thrown from. */
export interface CaptureTarget {
  readonly bug: Unit;
  /** The tile of the thrower's block nearest the bug. */
  readonly from: TileCoord;
  /** What the carrier will hold once the net comes down. */
  readonly specimen: CarriedSpecimen;
}

// ===========================================
// Queries
// ===========================================

/**
 * Whether an open `capture-specimen` objective asks for `species`
 * (#1179): one neither complete nor failed. The net is for the mission
 * that wants a specimen, not an execution tool for every other one, so
 * it is refused on a bug nobody asked for.
 *
 * @param mission - The mission.
 * @param species - The species in question.
 * @returns True while some open capture objective names it.
 */
export function specimenWanted(
  mission: TacticalState,
  species: string,
): boolean {
  return mission.objectives.some(
    (objective) =>
      objective.kind === "capture-specimen" &&
      !objective.complete &&
      objective.failed !== true &&
      objective.species === species,
  );
}

/**
 * The most hit points at which the net still holds on a bug (#1179):
 * `captureAtHpFraction` of its maximum, rounded down, and never below
 * one so a bug of one hit point is always catchable.
 *
 * ```
 *   lurker maxHp 8, fraction 0.5 ──► threshold 4: caught at 4 hp, not at 5
 * ```
 *
 * @param bug - The bug, or anything with its maximum hit points.
 * @param net - The net's profile.
 * @returns A whole number of hit points.
 */
export function captureThreshold(
  bug: Pick<Unit, "maxHp">,
  net: NetProfile,
): number {
  return Math.max(1, Math.floor(bug.maxHp * net.captureAtHpFraction));
}

/**
 * How far a net reaches between two tiles (#1179): the eight tiles round
 * the thrower on the plane, and a half-storey step up or down, as a
 * squad can lean over a kerb but not a floor.
 *
 * ```
 *   plane      chebyshev: a diagonal neighbour is 1, as an orthogonal one is
 *   height     |dy| × LAYER_TILES, rounded: one layer is 1, a storey is 2
 *   distance   the larger of the two
 * ```
 *
 * @param from - The thrower's tile.
 * @param to - The bug's tile.
 * @returns Tiles between them, as the net's range reads them.
 */
export function netDistance(from: TileCoord, to: TileCoord): number {
  return Math.max(
    chebyshevDistance(from, to),
    Math.round(Math.abs(from.y - to.y) * LAYER_TILES),
  );
}

// ===========================================
// Validation
// ===========================================

/**
 * Checks a capture net may come down on `tile` (#1179). The equipment
 * rules have already checked the unit, the action points and that a net
 * is left; this checks the throw.
 *
 * ```
 *   thrower  ──► cannot-carry (not a squad) · already-carrying
 *   target   ──► no-capture-target  (no living bug the side can see on the tile)
 *            ──► specimen-not-wanted (no open capture objective names its species)
 *   reach    ──► out-of-range        (more than the net's range by netDistance)
 *            ──► no-line-of-sight
 *   health   ──► target-too-healthy  (above captureThreshold)
 * ```
 *
 * Deterministic: a net that is thrown holds. It draws nothing from the
 * RNG, so adding it moves no other roll.
 *
 * @param mission - The mission.
 * @param unit - The squad throwing it.
 * @param definition - The net.
 * @param tile - Any tile of the bug's block.
 * @returns The target, or the refusal.
 */
export function validateCapture(
  mission: TacticalState,
  unit: Unit,
  definition: EquipmentDefinition,
  tile: TileCoord,
): Result<CaptureTarget, TacticalError> {
  const net = definition.net;
  if (net === undefined) {
    return err({
      kind: "no-equipment",
      unitId: unit.id,
      equipmentId: definition.id,
    });
  }
  if (!canCarrySpecimen(unit)) {
    return err({ kind: "cannot-carry", unitId: unit.id });
  }
  if (unit.carrying !== undefined) {
    return err({ kind: "already-carrying", unitId: unit.id });
  }
  const bug = mission.units.find(
    (candidate) =>
      candidate.kind === "bug" &&
      candidate.team !== unit.team &&
      candidate.hp > 0 &&
      canSee(mission, unit.team, candidate.id) &&
      footprintContains(
        candidate.pos,
        unitFootprintSize(mission, candidate),
        tile,
      ),
  );
  if (bug === undefined) {
    return err({ kind: "no-capture-target", x: tile.x, y: tile.y, z: tile.z });
  }
  const species = speciesOf(bug);
  if (species === undefined || !specimenWanted(mission, species)) {
    return err({ kind: "specimen-not-wanted", targetId: bug.id });
  }
  const { from, to, distance } = closestNetTiles(mission, unit, bug);
  if (distance > definition.range) {
    return err({ kind: "out-of-range", distance, range: definition.range });
  }
  if (!hasLineOfSight(mission.map, from, to, new TileIndex(mission.map))) {
    return err({ kind: "no-line-of-sight", targetId: bug.id });
  }
  const threshold = captureThreshold(bug, net);
  if (bug.hp > threshold) {
    return err({
      kind: "target-too-healthy",
      targetId: bug.id,
      hp: bug.hp,
      threshold,
    });
  }
  return ok({
    bug,
    from,
    specimen: {
      unitId: bug.id,
      species,
      templateId: bug.templateId,
      movePenalty: net.carryMovePenalty,
    },
  });
}

// ===========================================
// Capture
// ===========================================

/**
 * Takes the bug alive (#1179): it leaves the map — it acts no more, is
 * nobody's enemy and is not counted with the bugs — and the squad now
 * carries it. The caller has validated the throw and billed the net.
 *
 * ```
 *   units  ──► the bug removed; the thrower gains carrying = specimen
 *   events ──► SpecimenCaptured { unitId, specimen, pos }
 * ```
 *
 * @param mission - The mission, the net already billed.
 * @param unitId - The squad that threw it.
 * @param target - The validated target.
 * @returns The mission with the bug carried, and the event.
 */
export function captureSpecimen(
  mission: TacticalState,
  unitId: UnitId,
  target: CaptureTarget,
): TacticalApplied<TacticalState> {
  const units = mission.units
    .filter((candidate) => candidate.id !== target.bug.id)
    .map((candidate) =>
      candidate.id === unitId
        ? { ...candidate, carrying: target.specimen }
        : candidate,
    );
  return {
    state: { ...mission, units },
    events: [
      {
        type: SPECIMEN_CAPTURED,
        payload: {
          unitId,
          specimen: target.specimen,
          pos: {
            x: target.bug.pos.x,
            y: target.bug.pos.y,
            z: target.bug.pos.z,
          },
        },
      },
    ],
  };
}

// ===========================================
// Helpers
// ===========================================

/** A bug's species, read off its source id; undefined for anything that is not one. */
function speciesOf(bug: Unit): BugSpeciesId | undefined {
  return BUG_SPECIES_IDS.find((species) => species === bug.sourceId);
}

/** The nearest pair of tiles between two blocks by `netDistance`, and that distance. */
function closestNetTiles(
  mission: TacticalState,
  unit: Unit,
  bug: Unit,
): { from: TileCoord; to: TileCoord; distance: number } {
  let best = {
    from: unit.pos,
    to: bug.pos,
    distance: Number.POSITIVE_INFINITY,
  };
  for (const from of footprintTiles(
    unit.pos,
    unitFootprintSize(mission, unit),
  )) {
    for (const to of footprintTiles(bug.pos, unitFootprintSize(mission, bug))) {
      const distance = netDistance(from, to);
      if (distance < best.distance) {
        best = { from, to, distance };
      }
    }
  }
  return best;
}

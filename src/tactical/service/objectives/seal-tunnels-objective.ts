import { err, ok } from "../../../core/model/result";
import { manhattanDistance } from "../../../core/service/grid-math";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { PlacedCharge } from "../../model/equipment";
import type {
  ObjectiveInteraction,
  ObjectiveRules,
  ObjectiveTarget,
} from "../../model/objective-rules";
import type { PhaseStep } from "../../model/phase-step";
import type { TacticalEvent } from "../../model/tactical-event";
import type {
  SealTunnelsObjective,
  TacticalState,
} from "../../model/tactical-state";
import { TUNNEL_CHARGE_SET } from "../../model/tunnel-charge-set-event";
import type { TunnelMouth } from "../../model/tunnel-mouth";
import { isCharged, isSealed } from "../../model/tunnel-mouth";
import { TUNNEL_SEALED } from "../../model/tunnel-sealed-event";
import type { TunnelTuning } from "../../model/tunnel-tuning";
import type { Unit } from "../../model/unit";
import { isCombatUnit, isStandingForce } from "../../model/unit";
import { nearestFootprintTile } from "./footprint-tile";

// ===========================================
// Types
// ===========================================

/** What the objective reads from the tunnel tuning: the fuse and its blast. */
export type SealTunnelsTuning = Pick<
  TunnelTuning,
  "fuseTurns" | "chargeEquipmentId"
>;

/** How the sealing stands, read live from the mission. */
export interface SealProgress {
  /** Mouths the objective names that have collapsed. */
  readonly sealed: number;
  /** Mouths the objective names. */
  readonly total: number;
  /** The charges burning on its open mouths, in mouth order. */
  readonly burning: readonly PlacedCharge[];
}

// ===========================================
// Progress
// ===========================================

/**
 * The mouths `objective` names that are on the map, in the objective's
 * order. A name with no mouth behind it is skipped: it can never be
 * sealed, and counts toward the total but never toward the sealed.
 *
 * @param objective - The seal-tunnels objective.
 * @param mission - The mission whose mouths to read.
 */
export function trackedMouths(
  objective: SealTunnelsObjective,
  mission: TacticalState,
): readonly TunnelMouth[] {
  const byId = new Map(
    (mission.tunnelMouths ?? []).map((mouth) => [mouth.id, mouth]),
  );
  return objective.mouthIds.flatMap((id) => {
    const mouth = byId.get(id);
    return mouth === undefined ? [] : [mouth];
  });
}

/**
 * How many of the objective's mouths are sealed, of how many, and the
 * charges burning on the rest: the tracker's row and fuse countdowns
 * (campaign arc §6.7) read this.
 *
 * @param objective - The seal-tunnels objective.
 * @param mission - The mission to read.
 */
export function sealProgress(
  objective: SealTunnelsObjective,
  mission: TacticalState,
): SealProgress {
  const mouths = trackedMouths(objective, mission);
  const charges = new Map(mission.charges.map((charge) => [charge.id, charge]));
  return {
    sealed: mouths.filter(isSealed).length,
    total: objective.mouthIds.length,
    burning: mouths.flatMap((mouth) => {
      const charge =
        isCharged(mouth) && mouth.chargeId !== undefined
          ? charges.get(mouth.chargeId)
          : undefined;
      return charge === undefined ? [] : [charge];
    }),
  };
}

/**
 * The id a mouth's charge is issued: one per mouth, ever, since a mouth
 * takes one charge and the charge seals it. Derived rather than drawn
 * from the mission's id generator, which an interaction is not handed.
 *
 * @param mouth - The mouth the charge is set on.
 */
export function tunnelChargeId(mouth: Pick<TunnelMouth, "id">): string {
  return `${mouth.id}-charge`;
}

// ===========================================
// Interaction
// ===========================================

/**
 * `seal-tunnels`' interaction (campaign arc §6.7): a squad or a mech
 * beside an open tunnel mouth sets a charge on it. The mission provides
 * the charge — nobody carries it, and it spends no equipment use — and
 * it is the breaching charge of #1132 (`tuning.chargeEquipmentId`), set
 * on the mouth's middle tile with a `fuseTurns` fuse: it burns in
 * `TacticalState.charges`, goes off through the detonate step like any
 * other, and `sealBlownMouths` then caves the mouth in.
 *
 * ```
 *   not seal-tunnels ──► objective-not-interactive
 *   not a squad or mech (a turret) ──► cannot-interact
 *   no mouth of it on the map ──► objective-target-missing
 *   every open mouth already charged ──► tunnels-charged
 *   nearest open, uncharged mouth > interactRange ──► objective-out-of-reach
 *          │
 *          ▼
 *   PlacedCharge { id: <mouth>-charge, owner: unit, tile: mouth.pos,
 *                  detonatesOnTurn: turn + fuseTurns }
 *   mouth.chargeId ← that id
 *   TunnelChargeSet { unitId, mouthId, objectiveId, chargeId, detonatesOnTurn }
 * ```
 *
 * The mouth is the open, uncharged one nearest the unit (measured to its
 * nearest tile, the first of a tie in the objective's order), which is
 * the one `reachable` offers. A mech may set one as a squad may: a
 * satchel on a hole needs no hands a mech lacks, and the objective
 * should not ask a mech-heavy force for a squad it did not bring.
 * The Interact handler bills the action point.
 *
 * @param tuning - The fuse and the charge's equipment.
 */
export function createSetTunnelCharge(
  tuning: SealTunnelsTuning,
): ObjectiveInteraction {
  return (mission, objective, unit, objectiveTuning) => {
    if (objective.kind !== "seal-tunnels") {
      return err({
        kind: "objective-not-interactive",
        objectiveId: objective.id,
      });
    }
    if (!isCombatUnit(unit)) {
      return err({ kind: "cannot-interact", unitId: unit.id });
    }
    const mouths = trackedMouths(objective, mission);
    if (mouths.length === 0) {
      return err({
        kind: "objective-target-missing",
        objectiveId: objective.id,
        targetId: objective.mouthIds[0] ?? objective.id,
      });
    }
    const mouth = nearestChargeable(mouths, unit.pos);
    if (mouth === undefined) {
      return err({ kind: "tunnels-charged", objectiveId: objective.id });
    }
    const distance = manhattanDistance(
      unit.pos,
      nearestFootprintTile(mouth, unit.pos),
    );
    if (distance > objectiveTuning.interactRange) {
      return err({
        kind: "objective-out-of-reach",
        objectiveId: objective.id,
        distance,
        range: objectiveTuning.interactRange,
      });
    }

    const charge: PlacedCharge = {
      id: tunnelChargeId(mouth),
      ownerId: unit.id,
      equipmentId: tuning.chargeEquipmentId,
      tile: mouth.pos,
      detonatesOnTurn: mission.turn + tuning.fuseTurns,
    };
    return ok({
      state: {
        ...mission,
        charges: [...mission.charges, charge],
        tunnelMouths: (mission.tunnelMouths ?? []).map((candidate) =>
          candidate.id === mouth.id
            ? { ...candidate, chargeId: charge.id }
            : candidate,
        ),
      },
      events: [
        {
          type: TUNNEL_CHARGE_SET,
          payload: {
            unitId: unit.id,
            mouthId: mouth.id,
            objectiveId: objective.id,
            chargeId: charge.id,
            detonatesOnTurn: charge.detonatesOnTurn,
          },
        },
      ],
    });
  };
}

// ===========================================
// Phase step
// ===========================================

/**
 * Caves in every mouth whose charge has gone off (campaign arc §6.7): a
 * phase step, run with the other objective kinds' after the detonate
 * step, so a charge that blows as a player phase opens seals its mouth
 * in that same phase start. Set on turn T with a fuse of 3, the charge
 * goes as turn T+3 opens and the mouth is sealed on turn T+3.
 *
 * ```
 *   for each seal-tunnels objective, each of its mouths:
 *     charged ∧ its charge no longer in `charges` ──► sealedOnTurn ← turn
 *                                                     TunnelSealed { sealed, total }
 *     otherwise ──► unchanged
 * ```
 *
 * A charge leaves `charges` only by going off, so its absence is the
 * blast. The objective's completion is read live from the mouths; the
 * mission still waits for the force to extract.
 */
export const sealBlownMouths: PhaseStep = (mission) => {
  const mouths = mission.tunnelMouths ?? [];
  if (!mouths.some(isCharged)) {
    return { state: mission, events: [] };
  }
  const burning = new Set(mission.charges.map((charge) => charge.id));
  const blown = new Set(
    mouths
      .filter(
        (mouth) =>
          isCharged(mouth) &&
          mouth.chargeId !== undefined &&
          !burning.has(mouth.chargeId),
      )
      .map((mouth) => mouth.id),
  );
  if (blown.size === 0) {
    return { state: mission, events: [] };
  }
  const state: TacticalState = {
    ...mission,
    tunnelMouths: mouths.map((mouth) =>
      blown.has(mouth.id) ? { ...mouth, sealedOnTurn: mission.turn } : mouth,
    ),
  };
  const events: TacticalEvent[] = [];
  for (const objective of mission.objectives) {
    if (objective.kind !== "seal-tunnels") {
      continue;
    }
    const progress = sealProgress(objective, state);
    for (const mouth of trackedMouths(objective, mission)) {
      if (blown.has(mouth.id) && mouth.chargeId !== undefined) {
        events.push({
          type: TUNNEL_SEALED,
          payload: {
            mouthId: mouth.id,
            objectiveId: objective.id,
            chargeId: mouth.chargeId,
            sealed: progress.sealed,
            total: progress.total,
          },
        });
      }
    }
  }
  return { state, events };
};

// ===========================================
// Rules
// ===========================================

/**
 * `seal-tunnels` (campaign arc §6.7): set a charge on every tunnel
 * mouth, survive the fuse, then extract, as a clearance does once its
 * nests are down.
 *
 * ```
 *   complete       every mouth it names is sealed
 *   failed         not complete, and the mission was lost or no squad
 *                  or mech is left standing to set or outlast a charge
 *   interaction    createSetTunnelCharge(tuning)
 *   phaseStep      sealBlownMouths
 *   reachable      the open, uncharged mouth nearest the unit (its tile
 *                  nearest the unit), for a squad or a mech
 *   markers        every mouth not yet sealed
 *   destination    the first open, uncharged mouth; else the first unsealed
 *   tally          mouths sealed / mouths named
 *   resultFields   tunnelsSealed, tunnelsTotal
 * ```
 *
 * Complete is read live, so the tracker ticks the moment a mouth caves
 * in. Failed once nobody is left who could finish it: a charge still
 * burning when the last squad boards never goes off, because the
 * mission ends with them.
 *
 * @param tuning - The fuse and the charge's equipment.
 */
export function createSealTunnelsObjective(
  tuning: SealTunnelsTuning,
): ObjectiveRules<"seal-tunnels"> {
  return {
    kind: "seal-tunnels",
    /** Done once every named mouth has caved in. */
    complete(objective, mission) {
      return allSealed(objective, mission);
    },
    /** Lost with the mission, or with every squad and mech that could still finish it. */
    failed(objective, mission) {
      return (
        !allSealed(objective, mission) &&
        (mission.outcome === "lost" || !mission.units.some(isStandingForce))
      );
    },
    interaction: createSetTunnelCharge(tuning),
    phaseStep: sealBlownMouths,
    /** The open, uncharged mouth nearest the unit, when that unit could set a charge. */
    reachable(objective, mission, unit) {
      if (unit !== undefined && !isCombatUnit(unit)) {
        return undefined;
      }
      const mouths = trackedMouths(objective, mission);
      const mouth =
        unit === undefined
          ? mouths.find(isChargeable)
          : nearestChargeable(mouths, unit.pos);
      return mouth === undefined ? undefined : targetFor(mouth, unit);
    },
    /** A blip on every mouth still open, charged or not: burrowers still come up it. */
    markers(objective, mission) {
      return trackedMouths(objective, mission)
        .filter((mouth) => !isSealed(mouth))
        .map((mouth) => mouth.pos);
    },
    /** Where the next charge goes: public intel, as a wreck's tile is. */
    destination(objective, mission) {
      const mouths = trackedMouths(objective, mission);
      const next =
        mouths.find(isChargeable) ?? mouths.find((mouth) => !isSealed(mouth));
      return next === undefined ? {} : { position: next.pos };
    },
    /** Mouths sealed over mouths named, for the objective's result row. */
    tally(objective, mission) {
      const progress = sealProgress(objective, mission);
      return { done: progress.sealed, total: progress.total };
    },
    /** How many mouths caved in, for the debrief and the spread hold. */
    resultFields(objective, mission) {
      const progress = sealProgress(objective, mission);
      return { tunnelsSealed: progress.sealed, tunnelsTotal: progress.total };
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/** Whether every mouth the objective names is on the map and sealed; never for none. */
function allSealed(
  objective: SealTunnelsObjective,
  mission: TacticalState,
): boolean {
  const progress = sealProgress(objective, mission);
  return progress.total > 0 && progress.sealed === progress.total;
}

/** Whether a charge can still be set on the mouth: open, and none burning on it. */
function isChargeable(mouth: TunnelMouth): boolean {
  return !isSealed(mouth) && !isCharged(mouth);
}

/**
 * The chargeable mouth nearest `from`, measured to its nearest tile;
 * the first of a tie in the objective's order.
 */
function nearestChargeable(
  mouths: readonly TunnelMouth[],
  from: TileCoord,
): TunnelMouth | undefined {
  let best: TunnelMouth | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const mouth of mouths.filter(isChargeable)) {
    const distance = manhattanDistance(from, nearestFootprintTile(mouth, from));
    if (distance < bestDistance) {
      best = mouth;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The mouth as a target: its tile nearest the unit, so the reach the
 * HUD measures is the reach the interaction measures; its middle tile
 * when no unit is asking.
 */
function targetFor(
  mouth: TunnelMouth,
  unit: Unit | undefined,
): ObjectiveTarget {
  return {
    id: mouth.id,
    pos: unit === undefined ? mouth.pos : nearestFootprintTile(mouth, unit.pos),
  };
}

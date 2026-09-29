import type { AttackTarget } from "../model/attack-target";
import type { PlacedCharge } from "../model/equipment";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import { TUNNEL_CHARGE_DISARMED } from "../model/tunnel-charge-disarmed-event";
import type { TunnelMouth } from "../model/tunnel-mouth";
import { isCharged } from "../model/tunnel-mouth";
import type { UnitId } from "../model/unit";

// ===========================================
// Types
// ===========================================

/** A charge burning on a tunnel mouth, with the mouth it burns on. */
export interface BurningTunnelCharge {
  readonly mouth: TunnelMouth;
  readonly charge: PlacedCharge;
}

// ===========================================
// Constants
// ===========================================

/** What the HUD and the log call a charge burning on a tunnel mouth. */
export const TUNNEL_CHARGE_NAME = "Tunnel charge";

// ===========================================
// Lookup
// ===========================================

/**
 * Every charge burning on a tunnel mouth, in the mission's mouth order:
 * a mouth charged and not sealed, whose charge is still in `charges`.
 * A breaching charge set anywhere else is not among them, so a wall
 * charge in any other mission is never something a bug can pull.
 *
 * @param mission - The mission, or a side's view of it: charges are
 *   the TDF's own and every side sees them, as the HUD draws them.
 */
export function burningTunnelCharges(
  mission: Pick<TacticalState, "tunnelMouths" | "charges">,
): readonly BurningTunnelCharge[] {
  const mouths = mission.tunnelMouths ?? [];
  if (!mouths.some(isCharged)) {
    return [];
  }
  const charges = new Map(mission.charges.map((charge) => [charge.id, charge]));
  return mouths.flatMap((mouth) => {
    const charge =
      isCharged(mouth) && mouth.chargeId !== undefined
        ? charges.get(mouth.chargeId)
        : undefined;
    return charge === undefined ? [] : [{ mouth, charge }];
  });
}

/**
 * The burning tunnel charge `chargeId` names, or undefined when no mouth
 * has that charge burning on it.
 *
 * @param mission - The mission.
 * @param chargeId - The `PlacedCharge` id an attack names.
 */
export function findBurningTunnelCharge(
  mission: Pick<TacticalState, "tunnelMouths" | "charges">,
  chargeId: string,
): BurningTunnelCharge | undefined {
  return burningTunnelCharges(mission).find(
    (burning) => burning.charge.id === chargeId,
  );
}

// ===========================================
// Adapter
// ===========================================

/**
 * A burning tunnel charge as an attack target (campaign arc §6.7, Ben's
 * rule of 2026-09-28): the TDF's, so only a bug may attack it, on the
 * mouth's charge tile, with the melee hits it has left as its hit
 * points and no armour. Combat refuses anything but a melee weapon at
 * it and lands every melee attack (`combat-service`), so a hit is one
 * of `meleeHitsToDisarm`.
 *
 * ```
 *   mouth.chargeId ──► PlacedCharge ──► AttackTarget { kind: "charge",
 *                                         pos: charge.tile, hp: chargeHitsLeft,
 *                                         armor: 0, team: "tdf" }
 * ```
 *
 * @param burning - The charge and the mouth it burns on.
 */
export function tunnelChargeAttackTarget(
  burning: BurningTunnelCharge,
): AttackTarget {
  return {
    kind: "charge",
    id: burning.charge.id,
    name: TUNNEL_CHARGE_NAME,
    pos: burning.charge.tile,
    hp: burning.mouth.chargeHitsLeft ?? 1,
    armor: 0,
    team: "tdf",
  };
}

// ===========================================
// Strike
// ===========================================

/**
 * One landed melee attack on a burning tunnel charge: one hit off what
 * it takes to pull it, and at none the charge is pulled (Ben's rule,
 * 2026-09-28). The one place a tunnel charge is struck, as
 * `damageSpawner` is the one place a spawner is.
 *
 * ```
 *   hits left − 1 > 0 ──► chargeHitsLeft ← that; nothing else
 *   hits left − 1 = 0 ──► the charge out of `charges`, never going off
 *                         mouth: chargeId, chargeHitsLeft cleared,
 *                                chargesPulled + 1        (open, uncharged)
 *                         TunnelChargeDisarmed { unitId, mouthId, objectiveId,
 *                                                chargeId, pulled }
 *                         one per seal-tunnels objective naming the mouth
 * ```
 *
 * A mouth left open this way is the same as one never charged:
 * burrowers still come up it, and Interact sets a new charge on a full
 * fuse. Pure; a charge that is not burning on a mouth leaves the
 * mission untouched, since the caller's validation already refused it.
 *
 * @param mission - The mission; never mutated.
 * @param chargeId - The charge struck.
 * @param attackerId - The bug that struck it, recorded on the event.
 */
export function strikeTunnelCharge(
  mission: TacticalState,
  chargeId: string,
  attackerId: UnitId,
): TacticalApplied<TacticalState> {
  const burning = findBurningTunnelCharge(mission, chargeId);
  if (burning === undefined) {
    return { state: mission, events: [] };
  }
  const { mouth } = burning;
  const hitsLeft = Math.max(0, (mouth.chargeHitsLeft ?? 1) - 1);
  if (hitsLeft > 0) {
    return {
      state: withMouth(mission, { ...mouth, chargeHitsLeft: hitsLeft }),
      events: [],
    };
  }
  const pulled = (mouth.chargesPulled ?? 0) + 1;
  const { chargeId: _pulled, chargeHitsLeft: _hits, ...open } = mouth;
  const state: TacticalState = {
    ...withMouth(mission, { ...open, chargesPulled: pulled }),
    charges: mission.charges.filter((charge) => charge.id !== chargeId),
  };
  const events: TacticalEvent[] = mission.objectives.flatMap((objective) =>
    objective.kind === "seal-tunnels" && objective.mouthIds.includes(mouth.id)
      ? [
          {
            type: TUNNEL_CHARGE_DISARMED,
            payload: {
              unitId: attackerId,
              mouthId: mouth.id,
              objectiveId: objective.id,
              chargeId,
              pulled,
            },
          },
        ]
      : [],
  );
  return { state, events };
}

// ===========================================
// Helpers
// ===========================================

/** The mission with `mouth` in place of the mouth of its id. */
function withMouth(mission: TacticalState, mouth: TunnelMouth): TacticalState {
  return {
    ...mission,
    tunnelMouths: (mission.tunnelMouths ?? []).map((candidate) =>
      candidate.id === mouth.id ? mouth : candidate,
    ),
  };
}

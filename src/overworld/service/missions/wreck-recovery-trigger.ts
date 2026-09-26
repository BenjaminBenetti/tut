import type { City } from "../../model/city";
import type { Mission } from "../../model/mission";
import type {
  MissionOfferContext,
  MissionTriggerRule,
} from "../../model/mission-offer-rule";
import type { OverworldState } from "../../model/overworld-state";
import type { WreckRecoverySpec } from "../../model/wreck-recovery-spec";
import { isWreckStale } from "../wreck-service";
import { buildOffer, citiesWithOffers } from "./mission-offer-builder";

// ===========================================
// Wreck recovery: trigger
// ===========================================

/**
 * How a wreck recovery is offered (arc §5, §6.6): an event offer,
 * outside the board cap, one per mech destroyed on a lost or abandoned
 * mission. The launch handler records each such mech in
 * `OverworldState.wrecks` at the loss; this rule turns every record that
 * has no offer yet into one, at the city the mech fell in.
 *
 * ```
 *   for wreck in state.wrecks (oldest first):
 *     an offer already carries this mech's wreck    ──► skip (one offer per wreck)
 *     day ≥ lostDay + tuning.wreck.offerWindowDays   ──► skip (the wreck is gone)
 *     its city holds an offer, or is off the map     ──► skip (it waits for the city)
 *     otherwise ──► buildOffer(city, "wreck-recovery")
 *                   + wreck: the record, rewards.parts: its parts
 *                   + expiresDay = day + expiryDays (3, no intel bonus)
 * ```
 *
 * Expiry: the offer is not `pinned`. Like Defend Installation it sits
 * outside the cap because this is a trigger rule, and it lapses on its
 * own `expiresDay`, set here to exactly the type's `expiryDays` after
 * the offer so the one attempt lasts three days wherever it falls. Its
 * consequence rule clears the record when it is played or lapses, so
 * the wreck is never offered twice.
 *
 * Draws what `buildOffer` draws per offer (one id, one map seed); a day
 * with no fresh wreck draws nothing.
 */
export const WRECK_RECOVERY_TRIGGER: MissionTriggerRule = {
  kind: "trigger",
  typeId: "wreck-recovery",

  /** One offer per recorded wreck that has none yet and whose city is free. */
  trigger(state, ctx): readonly Mission[] {
    const occupied = citiesWithOffers(state);
    const offered: Mission[] = [];
    for (const wreck of state.wrecks ?? []) {
      if (
        isOffered(state, wreck) ||
        isWreckStale(wreck, state.day, ctx.tuning.wreck) ||
        occupied.has(wreck.cityId)
      ) {
        continue;
      }
      const city = state.map.cities.find(
        (candidate) => candidate.id === wreck.cityId,
      );
      if (city === undefined) {
        continue;
      }
      offered.push(wreckOffer(state, city, wreck, ctx));
      occupied.add(city.id);
    }
    return offered;
  },
};

// ===========================================
// Helpers
// ===========================================

/** Whether an offer on the board already carries this mech's wreck. */
function isOffered(state: OverworldState, wreck: WreckRecoverySpec): boolean {
  return state.missions.some(
    (mission) => mission.wreck?.mechId === wreck.mechId,
  );
}

/**
 * The wreck's offer: the ordinary offer at its city, carrying the
 * record, paying its parts, and lapsing exactly `expiryDays` after
 * today. Credits and tech come from the type and are zero (D6).
 */
function wreckOffer(
  state: OverworldState,
  city: City,
  wreck: WreckRecoverySpec,
  ctx: MissionOfferContext,
): Mission {
  const mission = buildOffer(state, city, "wreck-recovery", ctx);
  return {
    ...mission,
    wreck,
    rewards: { ...mission.rewards, parts: wreck.parts },
    expiresDay: state.day + ctx.missionTypes["wreck-recovery"].expiryDays,
  };
}

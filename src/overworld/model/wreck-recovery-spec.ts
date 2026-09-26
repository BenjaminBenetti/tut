import type { MechId } from "../../roster/model/mech";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { PartId } from "../../roster/model/mech-part";
import type { CityId } from "./city";
import type { MissionId } from "./mission";

// ===========================================
// Wreck recovery spec
// ===========================================

/**
 * A mech lost on a lost or abandoned mission, recorded the moment it
 * was lost (arc §6.6, D6). The roster forgets a destroyed mech when the
 * casualties are applied, so the launch handler writes this down first;
 * the Wreck Recovery trigger turns it into an offer, and the offer
 * carries it as `Mission.wreck` so the map, the briefing and the
 * renderer all read the same record.
 *
 * ```
 *   LaunchMission (outcome lost, mech destroyed)
 *     └─► OverworldState.wrecks += spec        (roster still knows the mech)
 *           └─► WRECK_RECOVERY_TRIGGER ──► Mission { typeId: "wreck-recovery", wreck: spec }
 *                 └─► won: rewards.parts ──► the part stock
 * ```
 *
 * `parts` is what the recovery pays: every part the mech had fitted
 * except its chassis, in `loadoutPartIds` order with repeats kept, at
 * base level. The chassis stays lost with the pilot's rank (D6); it is
 * kept apart in `chassisId` so the wreck can still be named and drawn.
 * Plain serializable data.
 */
export interface WreckRecoverySpec {
  /** The destroyed mech's id; a wreck is offered at most once per mech. */
  readonly mechId: MechId;
  /** The mech's player-facing name when it went down. */
  readonly mechName: string;
  /** The lost chassis: it sizes the wreck and is never returned. */
  readonly chassisId: PartId;
  /** The parts a won recovery returns to the stock, chassis excluded. */
  readonly parts: readonly PartId[];
  /** The loadout the mech went down in, so the wreck is drawn as it stood. */
  readonly loadout: MechLoadout;
  /** The city the mech was lost at; the offer is made there. */
  readonly cityId: CityId;
  /** The mission it was lost on. */
  readonly missionId: MissionId;
  /** Overworld day of the loss. */
  readonly lostDay: number;
  /**
   * Player turns a squad must work the wreck to strip it, one
   * interaction a turn (`WreckRecoveryTuning.stripTurns` at the loss);
   * the strip-wreck objective counts up to it.
   */
  readonly stripTurns: number;
}

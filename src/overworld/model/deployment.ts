import type { MechId } from "../../roster/model/mech";
import type { SquadId } from "../../roster/model/squad";
import type { MissionId } from "./mission";

/**
 * The force the player sends on one mission (GDD §4: choose deployment,
 * then launch). Roster units are referenced by id only, so this model
 * does not depend on roster services; checking that the units exist,
 * are fit to deploy and that at least one is sent belongs to the
 * `LaunchMission` command (#67).
 */
export interface Deployment {
  /** The mission being launched. */
  readonly missionId: MissionId;
  /** Squads sent, each at most once. */
  readonly squadIds: readonly SquadId[];
  /** Mechs sent, each at most once. */
  readonly mechIds: readonly MechId[];
}

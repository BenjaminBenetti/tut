import type { MechId } from "../../roster/model/mech";
import type { SquadId } from "../../roster/model/squad";
import type { MissionId } from "./mission";

// ===========================================
// Constants
// ===========================================

/**
 * Most units one deployment may carry (#487).
 *
 * A cap has to exist somewhere: `DeployPlacer` grows a deploy zone to 16
 * tiles and stops, `startTacticalMission` claims one distinct zone tile
 * per unit, so a seventeenth unit has nowhere to stand and the launch
 * fails after the player has committed to it. Before this the ceiling was
 * real but invisible.
 *
 * Eight rather than sixteen: sixteen is only where the map happens to run
 * out, and a sixteen-unit player turn would be a chore to play. Eight sits
 * comfortably above the starter roster of three, leaves room to grow into,
 * and is half the map's guarantee, so a change to zone size does not
 * immediately bind on it. The number is a design call the GDD does not
 * make — it is one constant with its own test, so it is cheap to move.
 */
export const MAX_DEPLOYED_UNITS = 8;

// ===========================================
// Deployment
// ===========================================

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

/** How many units a deployment carries, squads and mechs together. */
export function deploymentSize(deployment: Deployment): number {
  return deployment.squadIds.length + deployment.mechIds.length;
}

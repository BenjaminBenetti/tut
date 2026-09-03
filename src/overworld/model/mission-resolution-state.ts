import type { Mech } from "../../roster/model/mech";
import type { Squad } from "../../roster/model/squad";
import type { City } from "./city";

/**
 * The slice of game truth a `MissionResolver` may read. `LaunchMission`
 * (#67) assembles it from the root `GameState`, so `overworld/` never
 * imports `save/` (ADR 0002 §2.1) and a resolver depends only on what it
 * uses rather than on the whole save. Read-only: resolvers report through
 * `MissionResult` and never mutate these records.
 */
export interface MissionResolutionState {
  /** Roster squads, including every one named in the deployment. */
  readonly squads: readonly Squad[];
  /** Roster mechs, including every one named in the deployment. */
  readonly mechs: readonly Mech[];
  /** The mission's host city as it stands at launch. */
  readonly city: City;
}

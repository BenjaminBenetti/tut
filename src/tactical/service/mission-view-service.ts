import type { MissionView } from "../model/mission-view";
import type { TacticalState } from "../model/tactical-state";
import { NO_VISION } from "../model/tactical-state";
import type { Team } from "../model/unit";
import { perceivedUnits } from "./vision-service";

// ===========================================
// Views
// ===========================================

/**
 * The mission as `team` perceives it (ADR 0006 §2.3): its own units plus
 * the enemies it has spotted, and its own vision alone.
 *
 * ```
 *   units    ──► own units + vision[team].spotted
 *   vision   ──► { [team]: theirs, [other]: nothing }
 *   map, spawners, templates, turn, phase ──► unchanged
 * ```
 *
 * The other side's vision is blanked rather than dropped so the shape
 * stays a `TacticalState`; a behaviour reading it learns only that it
 * knows nothing, which is true from where it is standing.
 *
 * Pure. The only place a `MissionView` is made.
 */
export function viewFor(mission: TacticalState, team: Team): MissionView {
  const mine = mission.vision[team] ?? NO_VISION;
  const view: TacticalState = {
    ...mission,
    units: perceivedUnits(mission, team),
    vision:
      team === "tdf"
        ? { tdf: mine, bugs: NO_VISION }
        : { tdf: NO_VISION, bugs: mine },
  };
  // The brand is a compile-time marker with no runtime shape, so this is
  // the one cast that makes a view; every other route is a type error.
  return view as MissionView;
}

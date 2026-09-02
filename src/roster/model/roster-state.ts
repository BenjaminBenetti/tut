import type { Mech } from "./mech";
import type { MechLoadout } from "./mech-loadout";
import type { Squad } from "./squad";

/**
 * The roster slice of `GameState` (GDD §5.7, §5.8). Plain serializable
 * data; roster services return copies rather than mutating it.
 *
 * ```
 *   RosterState
 *   ├── squads[]         owned infantry, removed when wiped
 *   ├── mechs[]          owned mechs, removed when destroyed
 *   └── savedLoadouts[]  named templates mechs are built from
 * ```
 */
export interface RosterState {
  /** Owned squads in hire order. A wiped squad is removed. */
  readonly squads: readonly Squad[];
  /** Owned mechs in build order. A destroyed mech is removed. */
  readonly mechs: readonly Mech[];
  /** Loadout templates the player has saved, unique by `name`. */
  readonly savedLoadouts: readonly MechLoadout[];
}

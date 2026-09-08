import type { Mech } from "./mech";
import type { MechLoadout } from "./mech-loadout";
import type { Squad } from "./squad";

// ===========================================
// Graveyard
// ===========================================

/** Which kind of roster entry a graveyard entry memorialises. */
export type GraveyardKind = "squad" | "mech";

/**
 * A squad or mech lost in a mission, kept so the results screen can
 * memorialise it (GDD §2: losses should be memorable). Plain data.
 */
export interface GraveyardEntry {
  readonly kind: GraveyardKind;
  /** The entry's player-facing name at the time it was lost. */
  readonly name: string;
  /** Overworld day of the loss. */
  readonly day: number;
  /** The mission it was lost in. */
  readonly missionId: string;
  /**
   * The city the mission was fought over, so the memorial can name where
   * this happened rather than an internal id (#950).
   *
   * Optional because entries written before schema v17 genuinely have no
   * city and never will: the mission is gone from the offers by the time
   * the memorial is read, so nothing in an old save maps `missionId` back
   * to one. Those rows say nothing about where rather than guessing.
   */
  readonly cityId?: string;
}

// ===========================================
// Roster state
// ===========================================

/**
 * The roster slice of `GameState` (GDD §5.7, §5.8). Plain serializable
 * data; roster services return copies rather than mutating it.
 *
 * ```
 *   RosterState
 *   ├── squads[]         owned infantry, removed when wiped
 *   ├── mechs[]          owned mechs, removed when destroyed
 *   ├── savedLoadouts[]  named templates mechs are built from
 *   └── graveyard[]      squads and mechs lost, oldest first
 * ```
 */
export interface RosterState {
  /** Owned squads in hire order. A wiped squad is removed. */
  readonly squads: readonly Squad[];
  /** Owned mechs in build order. A destroyed mech is removed. */
  readonly mechs: readonly Mech[];
  /** Loadout templates the player has saved, unique by `name`. */
  readonly savedLoadouts: readonly MechLoadout[];
  /** Every squad wiped and mech destroyed, in the order they were lost. */
  readonly graveyard: readonly GraveyardEntry[];
}

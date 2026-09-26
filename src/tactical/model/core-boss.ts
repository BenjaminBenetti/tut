import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { IdGenerator } from "../../core/model/id-generator";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { BugUnitSource } from "./bug-unit-source";
import type { TacticalState } from "./tactical-state";

// ===========================================
// The boss a core stage stands
// ===========================================

/**
 * What a core boss's placement is handed besides the mission and the
 * tile (#1179): the Sovereign's `placeSovereign` takes exactly this
 * shape, so it plugs in as a `CoreBossPlacer` unchanged.
 */
export interface CoreBossPlacement {
  /** Issues her unit id; shared with the rest of the mission start. */
  readonly ids: IdGenerator;
  /** Her stat block. */
  readonly species: BugUnitSource;
  /** The tile she guards: the middle of the platform core. */
  readonly core: TileCoord;
  /** The difficulty her hit points scale with. */
  readonly difficulty?: number;
}

/**
 * Stands a boss on the map at `position` (her anchor: the lowest-`x`,
 * lowest-`z` tile of her block), guarding `deps.core`. Answers `state`
 * itself when she does not fit, as every placed bug does. Pure.
 */
export type CoreBossPlacer = (
  state: TacticalState,
  position: TileCoord,
  deps: CoreBossPlacement,
) => TacticalState;

/**
 * The boss the Spore Platform's core stage stands on the dais (campaign
 * arc §6.9, §9), injected by the composition root so `tactical` reads no
 * bug catalogue and no bug service: the Sovereign, with the species her
 * escort is drawn from, which the core's waves take their escort share
 * of bugs from (arc §8, the finale's 15).
 *
 * ```
 *   core stage setup ──► place(state, dais anchor, { ids, species, core, difficulty })
 *                   └──► bugMix = mix × (1 − escortShare) + escort × escortShare
 * ```
 *
 * Absent from the setup deps, the core stage stands no boss and its
 * waves roll the offer's mix as it is.
 */
export interface CoreBoss {
  /** Her stat block, handed to `place`. */
  readonly species: BugUnitSource;
  /** The species her escort is drawn from, in equal parts. Non-empty to take a share. */
  readonly escort: readonly BugSpeciesId[];
  /** Stands her on the map. */
  readonly place: CoreBossPlacer;
}

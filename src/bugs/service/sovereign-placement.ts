import type { PersonaId } from "../../content/model/persona-id";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { BugUnitSource } from "../../tactical/model/bug-unit-source";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { PlacedBugDeps } from "../../tactical/service/placed-bug-service";
import { placeBugsAt } from "../../tactical/service/placed-bug-service";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import type { SovereignTuning } from "../model/sovereign-tuning";
import { sovereignHp } from "./sovereign-service";

// ===========================================
// Constants
// ===========================================

/** The persona every placed Sovereign carries (campaign arc §9). */
const SOVEREIGN_PERSONA: PersonaId = "sovereign";

// ===========================================
// Types
// ===========================================

/** What `placeSovereign` needs besides the mission and the tile. */
export interface SovereignPlacementDeps extends PlacedBugDeps {
  /**
   * Her stat block (`BUG_SPECIES.sovereign`, passed in by the
   * composition root), so the placement reads no species catalogue.
   */
  readonly species: BugUnitSource;
  /**
   * The tile she guards: the platform core's centre on the finale's
   * core stage (the `platform-core` hook). She ranges no further than
   * her leash from it, and falls back onto it when she is hurt.
   */
  readonly core: TileCoord;
  /** The difficulty her hit points scale with; the mission's own when absent. */
  readonly difficulty?: number;
  /** Her numbers; the shipped set when absent. */
  readonly tuning?: SovereignTuning;
}

// ===========================================
// Placement
// ===========================================

/**
 * Stands the Sovereign on the map at mission start (#1179, campaign
 * arc §6.9 and §9): the seam the Spore Platform's core-stage setup
 * calls with the `sovereign-dais` hook. She goes down through the
 * shared placed-bug path (`placeBugsAt`), so the rules for where a
 * placed bug may stand are the Hive Guard's and the Broodmother's: her
 * whole 4×4 block must fit and be free, or she is not placed and the
 * mission comes back as it was.
 *
 * ```
 *   species ──► hp = sovereignHp(difficulty ?? state.difficulty)
 *   placeBugsAt(state, that, [position])
 *     ──► persona "sovereign" and core on her
 * ```
 *
 * She carries the `sovereign` persona, so she is named, plays her
 * persona's fallback, and the app's default Jev policy drives her when
 * a relay is configured (arc §9). Her hit points ride on her unit and
 * her template (`bug:sovereign`); a mission places one Sovereign.
 *
 * Pure: never mutates `state`, draws ids from `deps` only.
 *
 * @param state - The mission so far.
 * @param position - Her anchor: the lowest-`x`, lowest-`z` tile of her block.
 * @param deps - Ids, her species, the core she guards, the difficulty.
 * @returns The mission with her on it, or `state` when she did not fit.
 */
export function placeSovereign(
  state: TacticalState,
  position: TileCoord,
  deps: SovereignPlacementDeps,
): TacticalState {
  const tuning = deps.tuning ?? SOVEREIGN_TUNING;
  const source: BugUnitSource = {
    ...deps.species,
    hp: sovereignHp(deps.difficulty ?? state.difficulty, tuning),
  };
  const placed = placeBugsAt(state, source, [position], deps);
  if (placed === state) {
    return state;
  }
  const before = new Set(state.units.map((unit) => unit.id));
  const core: TileCoord = { x: deps.core.x, y: deps.core.y, z: deps.core.z };
  return {
    ...placed,
    units: placed.units.map((unit) =>
      before.has(unit.id)
        ? unit
        : { ...unit, persona: SOVEREIGN_PERSONA, core },
    ),
  };
}

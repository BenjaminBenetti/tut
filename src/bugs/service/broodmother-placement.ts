import type { PersonaId } from "../../content/model/persona-id";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { BugUnitSource } from "../../tactical/model/bug-unit-source";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { PlacedBugDeps } from "../../tactical/service/placed-bug-service";
import { placeBugsAt } from "../../tactical/service/placed-bug-service";
import { BROODMOTHER_TUNING } from "../data/broodmother-tuning";
import { BROODMOTHER_SCARRED_MODEL_ID } from "../data/species";
import type { BroodmotherTuning } from "../model/broodmother-tuning";
import { broodmotherHp } from "./broodmother-service";

// ===========================================
// Constants
// ===========================================

/** The persona every placed Broodmother carries (campaign arc §9). */
const BROODMOTHER_PERSONA: PersonaId = "broodmother";

// ===========================================
// Types
// ===========================================

/** What `placeBroodmother` needs besides the mission and the tile. */
export interface BroodmotherPlacementDeps extends PlacedBugDeps {
  /**
   * Her stat block (`BUG_SPECIES.broodmother`, passed in by the
   * composition root), so the placement reads no species catalogue.
   */
  readonly species: BugUnitSource;
  /** Earlier escapes (the nemesis record, arc §6.8); 0 for a first meeting. */
  readonly scars: number;
  /** Her numbers; the shipped set when absent. */
  readonly tuning?: BroodmotherTuning;
}

// ===========================================
// Placement
// ===========================================

/**
 * Stands the Broodmother on the map at mission start (#1179, campaign
 * arc §6.8): the seam Alpha Hunt's setup calls. She goes down through
 * the shared placed-bug path (`placeBugsAt`), so the rules for where a
 * placed bug may stand are the Hive Guard's: her whole 3×3 block must
 * fit and be free, or she is not placed and the mission comes back as
 * it was.
 *
 * ```
 *   species ──► hp = broodmotherHp(state.difficulty, scars)
 *          └──► model = scars > 0 ? bug.broodmother-scarred : species model
 *   placeBugsAt(state, that, [position]) ──► persona "broodmother" on her
 * ```
 *
 * She carries the `broodmother` persona, so she is named, plays her
 * persona's fallback, and the app's default Jev policy drives her when
 * a relay is configured (arc §9). Her hit points and model ride on her
 * unit and her template (`bug:broodmother`); a mission places one
 * Broodmother, and a second would share the first one's template.
 *
 * Pure: never mutates `state`, draws ids from `deps` only.
 *
 * @param state - The mission so far.
 * @param position - Her anchor: the lowest-`x`, lowest-`z` tile of her block.
 * @param deps - Ids, her species, her scars.
 * @returns The mission with her on it, or `state` when she did not fit.
 */
export function placeBroodmother(
  state: TacticalState,
  position: TileCoord,
  deps: BroodmotherPlacementDeps,
): TacticalState {
  const tuning = deps.tuning ?? BROODMOTHER_TUNING;
  const source: BugUnitSource = {
    ...deps.species,
    hp: broodmotherHp(state.difficulty, deps.scars, tuning),
    modelId:
      deps.scars > 0 ? BROODMOTHER_SCARRED_MODEL_ID : deps.species.modelId,
  };
  const placed = placeBugsAt(state, source, [position], deps);
  if (placed === state) {
    return state;
  }
  const before = new Set(state.units.map((unit) => unit.id));
  return {
    ...placed,
    units: placed.units.map((unit) =>
      before.has(unit.id) ? unit : { ...unit, persona: BROODMOTHER_PERSONA },
    ),
  };
}

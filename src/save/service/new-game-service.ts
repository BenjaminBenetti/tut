import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { EconomyTuning } from "../../economy/model/economy-tuning";
import { createInitialEconomyState } from "../../economy/service/economy-state-factory";
import type { EarthMap } from "../../overworld/model/earth-map";
import type { NewGameTuning } from "../../overworld/model/new-game-tuning";
import type { ThreatTuning } from "../../overworld/model/threat-tuning";
import { applyDebugThreat } from "../../overworld/service/campaign-debug-service";
import { createInitialOverworldState } from "../../overworld/service/overworld-state-factory";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { StarterRosterSpec } from "../../roster/model/starter-roster-spec";
import { createInitialRosterState } from "../../roster/service/roster-state-factory";
import type { GameState } from "../model/game-state";
import type { NewGameOptions } from "./game-state-factory";
import { createNewGameMeta } from "./game-state-factory";

// ===========================================
// Dependencies
// ===========================================

/**
 * Content and tuning a new campaign is built from. The app's composition
 * root supplies the shipped data (`EARTH_MAP`, `SQUAD_TYPES`,
 * `STARTER_ROSTER`, the tuning bundles); tests supply fixtures.
 */
export interface NewGameDeps {
  /** The Earth to start on, before any infestation is seeded. */
  readonly map: EarthMap;
  readonly squadTypes: SquadTypeCatalogue;
  readonly starterRoster: StarterRosterSpec;
  readonly newGameTuning: NewGameTuning;
  readonly threatTuning: ThreatTuning;
  readonly economyTuning: EconomyTuning;
}

// ===========================================
// Constants
// ===========================================

/**
 * Label of the RNG stream the opening infestation is drawn from. A
 * labelled fork is a pure function of the seed and this label, so later
 * consumers of the master stream can never perturb the opening.
 */
export const OPENING_INFESTATION_STREAM = "new-game:infestation";

// ===========================================
// Factory
// ===========================================

/**
 * Builds a complete, deterministic `GameState` for a fresh campaign.
 * Same `options.seed` and same `deps` always produce a deep-equal state.
 *
 * ```
 *   createNewGameMeta ──► meta { seed, rng, ids }
 *          │                 │        │
 *          │        fork("new-game:infestation")   restore ids
 *          │                 ▼        ▼
 *          │   overworld ◄── rng     ids ──► roster      economy
 *          │   (seeded map,          (squads, mechs)    (starting credits)
 *          │    day 1, threat)
 *          ▼
 *   GameState { meta (rng, ids written back), overworld, roster, economy }
 * ```
 *
 * The starter roster and balance are granted, not bought, so the ledger
 * starts empty and nothing is charged.
 */
export function createNewGame(
  options: NewGameOptions,
  deps: NewGameDeps,
): GameState {
  const meta = createNewGameMeta(options);
  const rng = Mulberry32Rng.fromState(meta.rng);
  const ids = new SequentialIdGenerator(meta.ids);

  const overworld = createInitialOverworldState(deps.map, {
    rng: rng.fork(OPENING_INFESTATION_STREAM),
    tuning: deps.newGameTuning,
    threatTuning: applyDebugThreat(deps.threatTuning, options.debug),
  });
  const roster = createInitialRosterState(deps.starterRoster, {
    ids,
    squadTypes: deps.squadTypes,
  });
  const economy = createInitialEconomyState(deps.economyTuning.startingCredits);

  return {
    meta: { ...meta, rng: rng.getState(), ids: ids.getState() },
    overworld,
    roster,
    economy,
  };
}

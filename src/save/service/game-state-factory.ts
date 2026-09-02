import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { GameState } from "../model/game-state";

/** Inputs the app supplies when starting a campaign. */
export interface NewGameOptions {
  readonly seed: number;
  /** ISO-8601 timestamp from the app's clock. */
  readonly createdAt: string;
}

/**
 * Builds the initial `GameState` for a fresh campaign. Everything random
 * downstream derives from `seed`; this is the one place the master RNG
 * and id generator are born.
 */
export function createNewGameState(options: NewGameOptions): GameState {
  return {
    meta: {
      seed: options.seed >>> 0,
      rng: new Mulberry32Rng(options.seed).getState(),
      ids: new SequentialIdGenerator().getState(),
      createdAt: options.createdAt,
    },
  };
}

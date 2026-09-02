import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { GameMeta } from "../model/game-state";

/** Inputs the app supplies when starting a campaign. */
export interface NewGameOptions {
  readonly seed: number;
  /** ISO-8601 timestamp from the app's clock. */
  readonly createdAt: string;
}

/**
 * Builds the `meta` slice for a fresh campaign. This is the one place the
 * master RNG and id generator are born; everything random downstream
 * derives from `seed`. `createNewGame` restores both from this snapshot,
 * fills the domain slices, and writes their advanced states back.
 */
export function createNewGameMeta(options: NewGameOptions): GameMeta {
  return {
    seed: options.seed >>> 0,
    rng: new Mulberry32Rng(options.seed).getState(),
    ids: new SequentialIdGenerator().getState(),
    createdAt: options.createdAt,
  };
}

import type {
  IdGenerator,
  IdGeneratorState,
} from "../../core/model/id-generator";
import type { Rng, RngState } from "../../core/model/rng";

/**
 * Rebuilds the stateful services persisted in `CampaignMeta` so a command
 * handler can draw from them. The dispatcher depends on this interface
 * rather than on concrete generators (ADR 0003 §2.2); the default
 * implementation in `overworld/service` uses the same classes
 * `createNewGameMeta` seeds, and tests can substitute recording fakes.
 */
export interface MetaServiceRestorer {
  /** Restores the master RNG from its snapshot. */
  restoreRng(snapshot: RngState): Rng;

  /** Restores the id generator from its snapshot. */
  restoreIds(snapshot: IdGeneratorState): IdGenerator;
}

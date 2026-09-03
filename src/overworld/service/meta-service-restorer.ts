import type {
  IdGenerator,
  IdGeneratorState,
} from "../../core/model/id-generator";
import type { Rng, RngState } from "../../core/model/rng";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { MetaServiceRestorer } from "../model/meta-service-restorer";

/**
 * `MetaServiceRestorer` backed by the generators `createNewGameMeta`
 * seeds a campaign with: Mulberry32 for randomness and per-prefix
 * sequential counters for ids. Restoring and then snapshotting without
 * drawing yields the same snapshot, so an idle handler leaves `meta`
 * deep-equal.
 */
export class DefaultMetaServiceRestorer implements MetaServiceRestorer {
  /** Restores a Mulberry32 stream from its snapshot. */
  restoreRng(snapshot: RngState): Rng {
    return Mulberry32Rng.fromState(snapshot);
  }

  /** Restores the sequential id counters from their snapshot. */
  restoreIds(snapshot: IdGeneratorState): IdGenerator {
    return new SequentialIdGenerator(snapshot);
  }
}

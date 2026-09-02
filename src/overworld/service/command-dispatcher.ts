import { commandError } from "../../core/model/command-error";
import type { IdGenerator } from "../../core/model/id-generator";
import { err, ok } from "../../core/model/result";
import type { Rng } from "../../core/model/rng";
import type { CampaignState } from "../model/campaign-state";
import type { CommandDispatcher } from "../model/command-dispatcher";
import { UNKNOWN_COMMAND } from "../model/command-dispatcher";
import type { CommandHandler, CommandOutcome } from "../model/command-handler";
import type { MetaServiceRestorer } from "../model/meta-service-restorer";
import type {
  CommandFor,
  OverworldCommand,
  OverworldCommandType,
} from "../model/overworld-command";
import { DefaultMetaServiceRestorer } from "./meta-service-restorer";

// ===========================================
// OverworldCommandDispatcher
// ===========================================

/**
 * `CommandDispatcher` backed by a handler map. Besides routing, it owns
 * the one piece of bookkeeping every command shares: restoring the master
 * RNG and id generator from `meta` before the handler runs and writing
 * their advanced states back into the returned state, so a save made
 * after any command continues the same sequences (ADR 0003 §2.3).
 *
 * ```
 *   process(state, command)
 *     ├─ no handler ─────────────────────────► err UNKNOWN_COMMAND
 *     ├─ rng = restore(meta.rng), ids = restore(meta.ids)
 *     ├─ outcome = handler(state, command, { rng, ids })
 *     ├─ outcome.err ────────────────────────► outcome (nothing written back)
 *     └─ ok { state: state' with meta.rng/ids := rng/ids snapshots, events }
 * ```
 */
export class OverworldCommandDispatcher<
  TState extends CampaignState,
> implements CommandDispatcher<TState> {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers = new Map<
    OverworldCommandType,
    CommandHandler<TState>
  >();
  private readonly restorer: MetaServiceRestorer;

  // ===========================================
  // Construction
  // ===========================================

  /** Creates an empty dispatcher that rebuilds `meta` services through `restorer`. */
  constructor(restorer: MetaServiceRestorer) {
    this.restorer = restorer;
  }

  // ===========================================
  // CommandDispatcher
  // ===========================================

  /**
   * Registers the one handler for a command type.
   *
   * @throws {Error} if a handler for `type` is already registered.
   */
  register<TType extends OverworldCommandType>(
    type: TType,
    handler: CommandHandler<TState, CommandFor<TType>>,
  ): void {
    if (this.handlers.has(type)) {
      throw new Error(`Duplicate handler for command "${type}"`);
    }
    // The map is keyed by type, so this handler only ever receives its
    // own command; widening the parameter type here is safe.
    this.handlers.set(type, handler as CommandHandler<TState>);
  }

  /**
   * Routes `command` to its handler with services restored from `meta`,
   * and writes their states back on success. Unknown types yield an
   * `UNKNOWN_COMMAND` error; nothing here throws for a bad command.
   */
  process(state: TState, command: OverworldCommand): CommandOutcome<TState> {
    const handler = this.handlers.get(command.type);
    if (handler === undefined) {
      return err(
        commandError(
          UNKNOWN_COMMAND,
          `No handler registered for command "${command.type}"`,
        ),
      );
    }
    const rng = this.restorer.restoreRng(state.meta.rng);
    const ids = this.restorer.restoreIds(state.meta.ids);
    const outcome = handler(state, command, { rng, ids });
    if (!outcome.ok) {
      return outcome;
    }
    return ok({
      state: this.writeBackMeta(outcome.value.state, rng, ids),
      events: outcome.value.events,
    });
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Returns `state` with the advanced RNG and id snapshots in `meta`. */
  private writeBackMeta(state: TState, rng: Rng, ids: IdGenerator): TState {
    return {
      ...state,
      meta: { ...state.meta, rng: rng.getState(), ids: ids.getState() },
    };
  }
}

// ===========================================
// Factory
// ===========================================

/**
 * Builds a dispatcher with the default `meta` restorer and no handlers.
 * The composition root registers handlers as their issues land (#65,
 * #67, #68, #70).
 */
export function createOverworldCommandDispatcher<
  TState extends CampaignState,
>(): OverworldCommandDispatcher<TState> {
  return new OverworldCommandDispatcher<TState>(
    new DefaultMetaServiceRestorer(),
  );
}

import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import type { Rng } from "../../core/model/rng";
import type { TacticalCommand } from "./tactical-command";
import type { TacticalError } from "./tactical-error";
import type { TacticalApplied } from "./tactical-event";
import type { TacticalState } from "./tactical-state";

// ===========================================
// Context
// ===========================================

/**
 * What a tactical handler may draw from: a stream forked for this one
 * command and the campaign's id generator, both handed down from the
 * campaign command context by the lifting adapter.
 */
export interface TacticalContext {
  /** Private to this command; fork it again per concern if a rule has several. */
  readonly rng: Rng;
  /** Issues ids for anything the command creates (spawned bugs, for instance). */
  readonly ids: IdGenerator;
}

// ===========================================
// Handler
// ===========================================

/** What a handler returns: the next mission state and events, or a typed rejection. */
export type TacticalOutcome = Result<
  TacticalApplied<TacticalState>,
  TacticalError
>;

/**
 * Applies one tactical command to a mission. Pure: never mutates its
 * inputs, draws randomness and ids only from `ctx`, and returns `err`
 * rather than throwing for anything a player could trigger (ADR 0003
 * §2.2). Rules issues (#325 movement, #328 attacks, #330 turns, …) each
 * supply one; the headless sim (#343) drives them without a store.
 *
 * ```
 *   (mission, command, { rng, ids }) ──► handler ──► ok { state: mission', events[] }
 *                                                └─► err TacticalError
 * ```
 */
export type TacticalHandler<
  TCommand extends TacticalCommand = TacticalCommand,
> = (
  mission: TacticalState,
  command: TCommand,
  ctx: TacticalContext,
) => TacticalOutcome;

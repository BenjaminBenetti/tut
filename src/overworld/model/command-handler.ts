import type { CommandError } from "../../core/model/command-error";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import type { Rng } from "../../core/model/rng";
import type { CampaignState } from "./campaign-state";
import type { OverworldCommand } from "./overworld-command";
import type { CampaignApplied } from "./campaign-event";

// ===========================================
// Context
// ===========================================

/**
 * Services a handler may draw from, restored by the dispatcher from
 * `meta.rng` / `meta.ids` and written back after the handler returns.
 * Handlers never read or write those `meta` fields themselves.
 */
export interface CommandContext {
  /**
   * Master RNG for this command. Fork it with a label per concern
   * (`rng.fork("tick:missions")`) so reordering draws in one step never
   * perturbs another (ADR 0003 §2.3).
   */
  readonly rng: Rng;
  /** Id generator for any entity the command creates. */
  readonly ids: IdGenerator;
}

// ===========================================
// Handler
// ===========================================

/** What a handler returns: the next state and events, or a typed rejection. */
export type CommandOutcome<TState> = Result<
  CampaignApplied<TState>,
  CommandError
>;

/**
 * Applies one command. Pure: never mutates `state` or `command`, draws
 * randomness and ids only from `ctx`, and returns `err` rather than
 * throwing for anything a player could trigger (ADR 0003 §2.2). On `err`
 * the dispatcher discards everything, including any ids or draws the
 * handler consumed, so the campaign is exactly as it was.
 *
 * ```
 *   (state, command, { rng, ids }) ──► handler ──► ok { state', events[] }
 *                                              └─► err CommandError
 * ```
 */
export type CommandHandler<
  TState extends CampaignState,
  TCommand extends OverworldCommand = OverworldCommand,
> = (
  state: TState,
  command: TCommand,
  ctx: CommandContext,
) => CommandOutcome<TState>;

import { commandError } from "../../core/model/command-error";
import { err, ok } from "../../core/model/result";
import type { CampaignEvent } from "../model/campaign-event";
import type { CampaignState } from "../model/campaign-state";
import type { CommandContext, CommandHandler } from "../model/command-handler";
import type { DeployableTypeCatalogue } from "../model/deployable-type-catalogue";
import type { AdvanceDayCommand } from "../model/overworld-command";
import { DAY_ADVANCED } from "../model/overworld-domain-event";
import type { TickContext, TickStep } from "../model/tick-step";
import { computeModifiers } from "./deployable-effects-service";

// ===========================================
// Types
// ===========================================

/** What the orchestrator itself needs; the steps carry their own deps. */
export interface AdvanceDayOptions {
  /** Resolves deployable types so every step sees current modifiers. */
  readonly catalogue: DeployableTypeCatalogue;
}

// ===========================================
// Error codes
// ===========================================

/** `CommandError.code` when `AdvanceDay` is issued after the campaign has ended. */
export const CAMPAIGN_OVER = "campaign-over";

// ===========================================
// Handler
// ===========================================

/**
 * Builds the `AdvanceDay` handler: a fold of `steps` over the campaign.
 * The day increments first and is announced by a `DayAdvanced` event;
 * each step then receives the state the previous one returned, together
 * with a fresh `TickContext`, and its events are appended in order.
 *
 * ```
 *   outcome set? ──yes──► err CAMPAIGN_OVER (state untouched)
 *        │no
 *   day := day + 1 ──► DayAdvanced { from, to }
 *        │
 *   for step in steps:
 *     ctx  = { day, rng: fork("tick:<day>:<name>"), ids, modifiers(state) }
 *     { state, events } = step.run(state, ctx)     events ++= ...
 *        │
 *   ok { state, events }
 * ```
 *
 * The step list is data: `createDefaultTickSteps` supplies the M1 order
 * and later milestones insert their own. Step names must be unique so
 * their RNG forks are.
 *
 * @throws {Error} at construction if two steps share a name.
 */
export function createAdvanceDayHandler<TState extends CampaignState>(
  steps: readonly TickStep<TState>[],
  options: AdvanceDayOptions,
): CommandHandler<TState, AdvanceDayCommand> {
  assertUniqueNames(steps);
  return (state, _command, ctx) => {
    if (state.overworld.outcome !== undefined) {
      return err(
        commandError(
          CAMPAIGN_OVER,
          `The campaign ended on day ${state.overworld.outcome.day}; no more days can be advanced`,
        ),
      );
    }

    const from = state.overworld.day;
    const to = from + 1;
    let current: TState = {
      ...state,
      overworld: { ...state.overworld, day: to },
    };
    const events: CampaignEvent[] = [
      { type: DAY_ADVANCED, payload: { from, to } },
    ];

    for (const step of steps) {
      const applied = step.run(
        current,
        contextFor(step, to, current, ctx, options),
      );
      current = applied.state;
      events.push(...applied.events);
    }
    return ok({ state: current, events });
  };
}

// ===========================================
// Helpers
// ===========================================

/** Builds a step's context from the state it is about to receive. */
function contextFor<TState extends CampaignState>(
  step: TickStep<TState>,
  day: number,
  state: TState,
  ctx: CommandContext,
  options: AdvanceDayOptions,
): TickContext {
  return {
    day,
    rng: ctx.rng.fork(`tick:${day}:${step.name}`),
    ids: ctx.ids,
    modifiers: computeModifiers(state.overworld, options.catalogue),
  };
}

/** Rejects a pipeline whose step names collide, since forks are keyed by name. */
function assertUniqueNames<TState extends CampaignState>(
  steps: readonly TickStep<TState>[],
): void {
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.name)) {
      throw new Error(`Duplicate tick step name "${step.name}"`);
    }
    seen.add(step.name);
  }
}

import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import type { CampaignApplied } from "./campaign-event";
import type { CampaignState } from "./campaign-state";
import type { DeployableModifiers } from "./deployable-modifiers";

// ===========================================
// Context
// ===========================================

/**
 * What one tick step is handed, rebuilt by the orchestrator before each
 * step from the state the previous step returned.
 *
 * ```
 *   day        the day being ticked (already incremented)
 *   rng        fork("tick:<day>:<step>") of the command's master stream
 *   ids        the command's id generator (shared, sequential)
 *   modifiers  computeModifiers(overworld) as of this step
 * ```
 */
export interface TickContext {
  /** The day being ticked: the previous day plus one. */
  readonly day: number;
  /**
   * A stream private to this step and this day. Labelled forks derive
   * from the campaign seed, so the label carries the day; two steps, or
   * the same step on two days, never share draws.
   */
  readonly rng: Rng;
  /** Id generator for anything the step creates; counters continue across steps. */
  readonly ids: IdGenerator;
  /** What online deployables contribute today, as of the current state. */
  readonly modifiers: DeployableModifiers;
}

// ===========================================
// Step
// ===========================================

/**
 * One stage of the day tick (GDD §5.2). Pure: returns the next campaign
 * state and the events describing what changed, never mutates its
 * input, and draws randomness only from `ctx.rng`. Steps are data the
 * orchestrator folds over, so a milestone adds a stage by adding a step
 * to the list, not by editing the orchestrator.
 */
export interface TickStep<TState extends CampaignState> {
  /** Unique within a pipeline; also labels the step's RNG fork. */
  readonly name: string;

  /** Applies the step to the campaign. */
  run(state: TState, ctx: TickContext): CampaignApplied<TState>;
}

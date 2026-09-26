import type { TacticalApplied } from "./tactical-event";
import type { TacticalContext } from "./tactical-handler";
import type { TacticalState } from "./tactical-state";

// ===========================================
// Phase step
// ===========================================

/**
 * One thing that happens when a phase begins, run in order over the
 * mission with the new phase and turn already set. The turn engine
 * ships `refreshSides`; spawning (#329) adds its waves the same way, as
 * the overworld's tick steps do for a day, and an objective kind may
 * bring its own (ADR 0013 §2.3).
 *
 * Lives in the model so the objective rules contract can name it
 * without importing the turn engine; `turn-service` re-exports it.
 */
export type PhaseStep = (
  mission: TacticalState,
  ctx: TacticalContext,
) => TacticalApplied<TacticalState>;

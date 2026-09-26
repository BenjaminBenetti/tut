import type { CampaignState } from "../model/campaign-state";
import type { ContinentCatalogue } from "../model/continent";
import type { MissionTuning } from "../model/mission-tuning";
import type { TickStep } from "../model/tick-step";
import { revealGreatHives } from "./great-hive-service";

// ===========================================
// Step name
// ===========================================

/** The reveal step's name; also its RNG fork label. */
export const GREAT_HIVE_REVEAL_STEP_NAME = "great-hive-reveal";

// ===========================================
// Types
// ===========================================

/** What the reveal step reads. */
export interface GreatHiveRevealStepDeps {
  /**
   * The continents the Great Hives sit on. Absent in fixtures that never
   * reach Act III, and then the step never reveals anything.
   */
  readonly continents?: ContinentCatalogue;
  /** `greatHive.count`: how many to reveal. */
  readonly missionTuning: Pick<MissionTuning, "greatHive">;
}

// ===========================================
// Tick step
// ===========================================

/**
 * The `great-hive-reveal` tick step: `revealGreatHives` on the day
 * being ticked, drawing the continents from the step's own stream. It
 * runs after `hive-formation`, so the draw sees the day's hives, and
 * before `mission-generation`, so the Great Hives' assaults are pinned
 * the day they are revealed.
 *
 * ```
 *   Uplink won (launch handler) ──► uplink-won
 *   next day tick ──► great-hive-reveal ──► 3 Great Hives, GreatHivesRevealed
 *                 ──► mission-generation ──► one pinned assault each
 * ```
 *
 * On every other day, and before Uplink, it changes nothing and draws
 * nothing.
 */
export function createGreatHiveRevealStep<TState extends CampaignState>(
  deps: GreatHiveRevealStepDeps,
): TickStep<TState> {
  return {
    name: GREAT_HIVE_REVEAL_STEP_NAME,
    run: (state, ctx) => {
      if (deps.continents === undefined) {
        return { state, events: [] };
      }
      const revealed = revealGreatHives(
        state.overworld,
        ctx.day,
        ctx.rng,
        ctx.ids,
        {
          continents: deps.continents,
          tuning: deps.missionTuning.greatHive,
        },
      );
      if (revealed.state === state.overworld) {
        return { state, events: [] };
      }
      return {
        state: { ...state, overworld: revealed.state },
        events: revealed.events,
      };
    },
  };
}

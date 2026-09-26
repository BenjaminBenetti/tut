import type { IdGenerator } from "../../../core/model/id-generator";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import type { SitrepId } from "../../../content/model/sitrep-id";
import { SITREP_IDS } from "../../../content/model/sitrep-id";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { PhaseStep } from "../../model/phase-step";
import type { SitrepRules } from "../../model/sitrep-rule";
import type { TacticalState } from "../../model/tactical-state";
import { SITREP_RULES } from "./sitrep-rules";

// ===========================================
// Streams
// ===========================================

/**
 * The label of the mission-seed fork a sitrep's setup draws from, and of
 * the phase-stream fork its phase step runs on: `sitrep:<id>`. One
 * stream per sitrep, so adding, removing or reordering sitreps never
 * shifts another's draws, nor anything else the start or a phase draws.
 */
export function sitrepRngLabel(id: SitrepId): string {
  return `sitrep:${id}`;
}

/**
 * The sitreps a mission carries, in `SITREP_IDS` order rather than the
 * order they were rolled, so every hook applies in one fixed order.
 */
export function activeSitreps(
  mission: Pick<TacticalState, "sitreps">,
): readonly SitrepId[] {
  const carried = mission.sitreps;
  if (carried === undefined || carried.length === 0) {
    return [];
  }
  return SITREP_IDS.filter((id) => carried.includes(id));
}

// ===========================================
// Setup
// ===========================================

/**
 * Applies the setup of every sitrep the mission carries, after its
 * type's setup and the garrison and before the first look (ADR 0013
 * §2.3).
 *
 * ```
 *   for id in SITREP_IDS, if mission.sitreps has it and its rule has setup:
 *     state = rule.setup(state, map, { rng: Mulberry32Rng(seed).fork("sitrep:<id>"), ids })
 * ```
 *
 * A later sitrep sees what an earlier one placed (City Ablaze keeps off
 * Spore Fog's smoke, Salvage Rich off City Ablaze's fire), but draws
 * from its own stream. A mission without sitreps is returned as it came.
 *
 * @param state - The mission with its type's objectives and the garrison placed.
 * @param map - The generated map.
 * @param seed - The mission's seed, which each sitrep's stream is forked from.
 * @param ids - The start's id generator.
 * @param rules - The sitrep table; the shipped one by default.
 * @returns The mission with every sitrep set up.
 */
export function applySitrepSetups(
  state: TacticalState,
  map: TacticalMap,
  seed: number,
  ids: IdGenerator,
  rules: SitrepRules = SITREP_RULES,
): TacticalState {
  let next = state;
  for (const id of activeSitreps(state)) {
    const setup = rules[id].setup;
    if (setup === undefined) {
      continue;
    }
    next = setup(next, map, {
      rng: new Mulberry32Rng(seed).fork(sitrepRngLabel(id)),
      ids,
    });
  }
  return next;
}

// ===========================================
// Sight
// ===========================================

/**
 * A unit's sight range under the sitreps a mission carries: its own
 * range passed through each one's `sight` hook in `SITREP_IDS` order.
 * The vision service calls this from `sightRangeOf`, its one read of a
 * unit's sight.
 *
 * @param range - The range from the unit's template, in tiles.
 * @param mission - The mission, for its sitreps.
 * @param rules - The sitrep table; the shipped one by default.
 * @returns The range the unit actually sees.
 */
export function sitrepSightRange(
  range: number,
  mission: Pick<TacticalState, "sitreps">,
  rules: SitrepRules = SITREP_RULES,
): number {
  let sight = range;
  for (const id of activeSitreps(mission)) {
    sight = rules[id].sight?.(sight) ?? sight;
  }
  return sight;
}

// ===========================================
// Phase steps
// ===========================================

/**
 * One phase step per sitrep that has one, in `SITREP_IDS` order, each
 * running only on a mission that carries its sitrep and on its own fork
 * of the phase's stream. The composition root appends these after every
 * other step, as it does the objective rules' steps.
 *
 * @param rules - The sitrep table; the shipped one by default.
 * @returns The steps, ready to append to the end-turn handler's list.
 */
export function sitrepPhaseSteps(
  rules: SitrepRules = SITREP_RULES,
): PhaseStep[] {
  const steps: PhaseStep[] = [];
  for (const id of SITREP_IDS) {
    const step = rules[id].phaseStep;
    if (step === undefined) {
      continue;
    }
    steps.push((mission, ctx) =>
      mission.sitreps?.includes(id) === true
        ? step(mission, { ...ctx, rng: ctx.rng.fork(sitrepRngLabel(id)) })
        : { state: mission, events: [] },
    );
  }
  return steps;
}

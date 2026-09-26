import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import type { SitrepId } from "../../content/model/sitrep-id";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { PhaseStep } from "./phase-step";
import type { TacticalState } from "./tactical-state";

// ===========================================
// Setup context
// ===========================================

/**
 * What a sitrep's setup may draw from: its own stream and the start's
 * id generator.
 *
 * ```
 *   rng   new Mulberry32Rng(mission.seed).fork(`sitrep:${id}`)
 *         a pure function of the seed and the sitrep's id, so adding,
 *         removing or reordering sitreps never shifts another's draws
 *   ids   the mission start's generator; effects and carcasses draw from it
 * ```
 */
export interface SitrepSetupContext {
  /** This sitrep's own stream for this mission. */
  readonly rng: Rng;
  /** Issues effect, carcass and any other ids the setup needs. */
  readonly ids: IdGenerator;
}

// ===========================================
// Rule
// ===========================================

/**
 * What one sitrep does to a mission (campaign arc §11, ADR 0013 §2.3):
 * a small interface of optional hooks, so each sitrep uses only what it
 * needs. One module per sitrep under `tactical/service/sitreps/`, listed
 * in `SITREP_RULES`.
 *
 * ```
 *   startTacticalMission
 *     type setup ──► garrison ──► setup? per sitrep, in SITREP_IDS order ──► first look
 *   sightRangeOf(mission, unit) ──► sight?(range) per sitrep on the mission
 *   EndTurn ──► phaseStep? per sitrep on the mission, after every other step
 * ```
 *
 * Every hook is pure and deterministic. A setup reads the mission as the
 * type's rule, the garrison and the sitreps before it in `SITREP_IDS`
 * order left it, and draws only from its context, so the same mission
 * always starts the same way.
 */
export interface SitrepRule {
  /** The sitrep this rule applies; equal to its table key. */
  readonly id: SitrepId;
  /**
   * Changes the freshly set-up mission: smoke or fire on the ground,
   * carcasses, what the squad already knows. Runs after the type's
   * `MissionSetupRule` and the garrison, before the first look, so what
   * it adds is already in the first frame's vision.
   *
   * @param state - The mission with the type's objectives and the garrison placed.
   * @param map - The generated map.
   * @param ctx - This sitrep's stream and the start's id generator.
   */
  readonly setup?: (
    state: TacticalState,
    map: TacticalMap,
    ctx: SitrepSetupContext,
  ) => TacticalState;
  /**
   * A unit's sight range under this sitrep, from the range it would
   * otherwise have. Applied by the vision service to every unit of both
   * sides, so spotting, fog and overwatch reach all follow it.
   *
   * @param range - The sight range before this sitrep, in tiles.
   */
  readonly sight?: (range: number) => number;
  /**
   * Runs at the start of every phase of a mission carrying this sitrep,
   * after every other phase step.
   */
  readonly phaseStep?: PhaseStep;
}

/**
 * One rule per sitrep. A `Record` over the closed `SitrepId` union, so a
 * sitrep without a rule is a compile error.
 */
export type SitrepRules = Readonly<Record<SitrepId, SitrepRule>>;

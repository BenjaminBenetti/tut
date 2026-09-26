import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { MissionResult } from "../../overworld/model/mission-result";
import type { ObjectiveTuning } from "./objective-tuning";
import type { PhaseStep } from "./phase-step";
import type { TacticalApplied } from "./tactical-event";
import type { TacticalContext, TacticalOutcome } from "./tactical-handler";
import type { Objective, TacticalState } from "./tactical-state";
import type { Unit, UnitId } from "./unit";

// ===========================================
// Kinds
// ===========================================

/** Every objective kind: the discriminator of the closed `Objective` union. */
export type ObjectiveKind = Objective["kind"];

/** Every objective interface, keyed by its kind. */
export type ObjectivesByKind = {
  readonly [O in Objective as O["kind"]]: O;
};

/**
 * The objective interface of one kind, e.g. `DestroySpawnerObjective`
 * for `"destroy-spawner"`. An indexed access rather than an `Extract`:
 * the compiler then reads `ObjectiveRules<K>` as covariant in `K`, which
 * is what lets one kind's rules stand in for the whole union's.
 */
export type ObjectiveOfKind<K extends ObjectiveKind> = ObjectivesByKind[K];

// ===========================================
// What a rule answers with
// ===========================================

/**
 * What one objective kind does when a unit works it. The `Interact`
 * handler has already checked the unit and found the objective open, so
 * an interaction only validates its own preconditions, applies its own
 * effect and announces it; the handler bills the action point and asks
 * whether the mission is over.
 *
 * One per kind, the way `PhaseStep` is one per thing a phase does: new
 * kinds add their own without touching the handler or each other (ADR
 * 0003 §2.2 — pure, no mutation). Typed over the whole union so a table
 * of them can be keyed by kind and substituted in tests; an interaction
 * refuses an objective of another kind.
 */
export type ObjectiveInteraction = (
  mission: TacticalState,
  objective: Objective,
  unit: Unit,
  tuning: ObjectiveTuning,
) => TacticalOutcome;

/** The thing a unit works an objective on, and where it stands. */
export interface ObjectiveTarget {
  /** The target's own id: a spawner's, a unit's, a hook entity's. */
  readonly id: string;
  readonly pos: TileCoord;
}

/**
 * Where an objective is, for an entity controller choosing where to go
 * (ADR 0012). Public intel only: a position or the ids of the units the
 * objective is about, never a target's health.
 */
export interface ObjectiveDestination {
  /** The tile to head for, when the objective is one place. */
  readonly position?: TileCoord;
  /** The units the objective is about, when it is about units. */
  readonly targetIds?: readonly UnitId[];
}

/** How far an objective got, in its own unit: generators standing, pods wrecked, groups out. */
export interface ObjectiveTally {
  readonly done: number;
  readonly total: number;
}

/**
 * Fields an objective kind adds to the mission result beside its
 * generic `ObjectiveResult` row. A kind with a result payload of its
 * own adds its optional field to `MissionResult` and names it here.
 */
export type ObjectiveResultFields = Partial<
  Pick<
    MissionResult,
    | "defence"
    | "podDestroyed"
    | "specimenCaptured"
    | "civiliansRescued"
    | "civiliansTotal"
  >
>;

// ===========================================
// Rules
// ===========================================

/**
 * Everything one objective kind means in the tactical layer (ADR 0013
 * §2.3), in one module under `tactical/service/objectives/`. The generic
 * services — completion, the Interact handler, reach, fog markers, Jev
 * destinations, deadlines, the phase-step list and the mission result —
 * dispatch through `OBJECTIVE_RULES` instead of branching on the kind,
 * so a new kind is a new module and one table entry.
 *
 * ```
 *   objective ──► OBJECTIVE_RULES[objective.kind]
 *                   ├── complete / failed      objective-status (end, abandon, result)
 *                   ├── interaction?           Interact handler (refused when absent)
 *                   ├── reachable?             reachableObjectives, the HUD's offer
 *                   ├── workedUntilEmpty?      Interact, reach and blips past the flags
 *                   ├── marker? / markers?     objectiveMarkers, the fog blips
 *                   ├── destination?           Jev destinations
 *                   ├── onDeadline?            the deadline phase step
 *                   ├── onExtracted?           the Extract handler, per unit aboard
 *                   ├── phaseStep?             EndTurn's phase steps
 *                   ├── tally? resultFields?   the mission result
 *                   └── kind                   must equal its table key
 * ```
 *
 * Every method is pure and reads only its arguments. They take the
 * objective first and the mission second; `complete` and `failed` answer
 * the kind's own rule, and the generic `objectiveComplete` and
 * `objectiveFailed` add the sticky flags on top, so a rule never has to.
 *
 * Methods rather than function-typed properties on purpose: a table of
 * rules for different kinds is then usable as rules for the whole union,
 * which is how `objectiveRulesFor` hands out the rule for an objective
 * without a cast. It always hands out the rule for that objective's own
 * kind, so no rule ever sees another kind's objective.
 */
export interface ObjectiveRules<K extends ObjectiveKind> {
  /** The kind these rules are for; equal to the table key they sit under. */
  readonly kind: K;
  /**
   * Whether the objective is done by the kind's own rule: a flag set
   * when the thing happened, or a live reading of the mission.
   */
  complete(objective: ObjectiveOfKind<K>, mission: TacticalState): boolean;
  /**
   * Whether the kind's own rule says the objective can never be done
   * now. A passed deadline is not the rule's business: the deadline
   * step records that on the objective's `failed` flag.
   */
  failed(objective: ObjectiveOfKind<K>, mission: TacticalState): boolean;
  /** What `Interact` does to an objective of this kind; absent, it is refused as not interactive. */
  readonly interaction?: ObjectiveInteraction;
  /** Runs at every phase start after the edge waves; the kind's passive rule, as a defence's is. */
  readonly phaseStep?: PhaseStep;
  /**
   * True for a kind worked until it has nothing left, whatever its
   * flags say: a rescue (campaign arc §6.4) is complete at half the
   * groups aboard, or failed once half can no longer get out, and every
   * group still freed and walked out counts toward the reward either
   * way. The Interact handler, the reach query and the fog blips then
   * leave the flags alone and let the kind's own `interaction`,
   * `reachable` and `markers` say when nothing is left. Absent: a
   * complete objective is done with, and a failed one is not blipped.
   */
  readonly workedUntilEmpty?: boolean;
  /**
   * The target a unit works this objective on, or undefined when there
   * is nothing left to work. `reachableObjectives` measures the unit's
   * distance to it; a kind with an `interaction` supplies this, or the
   * HUD never offers what the handler would accept. `unit` is the one
   * asking, when there is one, so a kind with several targets — a
   * rescue's groups — can answer with the one nearest it.
   */
  reachable?(
    objective: ObjectiveOfKind<K>,
    mission: TacticalState,
    unit?: Unit,
  ): ObjectiveTarget | undefined;
  /**
   * Where to put the white fog blip for this open objective (#1173),
   * or undefined when it needs none: its target is gone, or is a unit
   * of ours and so always in sight.
   */
  marker?(
    objective: ObjectiveOfKind<K>,
    mission: TacticalState,
  ): TileCoord | undefined;
  /**
   * Every fog blip for an objective with several places at once — a
   * rescue's trapped groups (campaign arc §6.4). Read instead of
   * `marker` when present; the blips already in view are dropped by
   * `objectiveMarkers` as a single one is.
   */
  markers?(
    objective: ObjectiveOfKind<K>,
    mission: TacticalState,
  ): readonly TileCoord[];
  /** Where an entity controller should look for this objective (ADR 0012). */
  destination?(
    objective: ObjectiveOfKind<K>,
    mission: TacticalState,
  ): ObjectiveDestination;
  /**
   * What happens when the deadline passes with the objective open: a
   * pod releasing its wave, a drop ship leaving. Called by the deadline
   * step after it has marked the objective failed and announced it, with
   * the objective as marked and the mission it is marked in.
   */
  onDeadline?(
    objective: ObjectiveOfKind<K>,
    mission: TacticalState,
    ctx: TacticalContext,
  ): TacticalApplied<TacticalState>;
  /**
   * What happens when a unit boards the drop ship, called by the Extract
   * handler for every objective after the unit has left the map and
   * before the terminal check: a rescue counting a group aboard
   * (campaign arc §6.4). `unit` is the unit as it left. Answers the
   * mission unchanged, with no events, when the unit is not this
   * objective's business.
   */
  onExtracted?(
    objective: ObjectiveOfKind<K>,
    mission: TacticalState,
    unit: Unit,
  ): TacticalApplied<TacticalState>;
  /** How far the objective got, for its `ObjectiveResult` row; absent, the row carries no count. */
  tally?(objective: ObjectiveOfKind<K>, mission: TacticalState): ObjectiveTally;
  /** The kind's own fields on the mission result, e.g. a defence's `defence`. */
  resultFields?(
    objective: ObjectiveOfKind<K>,
    mission: TacticalState,
  ): ObjectiveResultFields;
}

/**
 * One rules entry per objective kind. A mapped type rather than a
 * `Record`, so each key is tied to the rules for that very kind: a
 * missing kind, or the rules of one kind filed under another, is a
 * compile error.
 */
export type ObjectiveRulesTable = {
  readonly [K in ObjectiveKind]: ObjectiveRules<K>;
};

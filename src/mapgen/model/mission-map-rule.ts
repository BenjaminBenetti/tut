import type {
  MissionHookRequirement,
  MissionType,
} from "../../content/model/mission-type";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { Mission } from "../../overworld/model/mission";
import type { HookKind } from "./hook";
import type {
  HookRequirement,
  MapArchetype,
  MapDimensions,
} from "./map-recipe";

// ===========================================
// Mission map rule (ADR 0013 §2.3)
// ===========================================

/**
 * What a mission type adds to its map beyond the parts every mission
 * shares. The adapter keeps the generic parts — the type's
 * `requiredHooks`, the mission's tech carcass, biome, settlement, size,
 * seed and infestation — and asks the type's rule for the rest.
 *
 * `extraHooks` are content-vocabulary requirements, like the type's own:
 * the adapter scales them by difficulty and completes them from
 * `HOOK_KIND_DEFAULTS` exactly as it does `requiredHooks`, and appends
 * them after the carcass so the recipe's hook order is unchanged.
 *
 * An archetype with a board and hook list of its own (the hive cavern,
 * #1179) names them in `size` and `hooks` instead: the adapter then uses
 * that board in place of the mission's named size and that hook list in
 * place of the type's `requiredHooks` and `extraHooks`, still appending
 * the mission's carcass. A rule that sets neither is read exactly as
 * before.
 *
 * ```
 *   plan.hooks absent   requiredHooks + carcass + extraHooks, × difficulty
 *   plan.hooks present  plan.hooks as given + carcass
 *   plan.size present   that board, not mapParams.size
 * ```
 *
 * `hookPlacement` lets one mission move a kind's hooks nearer or farther
 * than the kind's defaults, for every requirement of that kind: First
 * Skyfall brings its spore pod in close to the drop zone. The adapter
 * lays it over `HOOK_KIND_DEFAULTS[kind]` and then fits the minimum to
 * the board as it does the default.
 */
export interface MissionMapPlan {
  /** Which pass list builds the map (ADR 0004 §7.3). */
  readonly archetype: MapArchetype;
  /** Hooks this mission needs on top of its type's `requiredHooks`. */
  readonly extraHooks: readonly MissionHookRequirement[];
  /** Registered authored site the map must reserve (`MISSION_SITES`). */
  readonly site?: string;
  /** Building kind raised on the lot nearest the centre. */
  readonly landmark?: string;
  /** Distances from deploy this mission sets for a kind, over the kind's defaults. */
  readonly hookPlacement?: Readonly<Partial<Record<HookKind, HookPlacement>>>;
  /** The board, in place of the mission's named size. */
  readonly size?: MapDimensions;
  /**
   * The whole hook list in mapgen vocabulary, in place of the type's
   * `requiredHooks` and `extraHooks`; the mission's carcass is appended.
   */
  readonly hooks?: readonly HookRequirement[];
}

/**
 * How far from the drop zone a mission wants a kind's hooks, overriding
 * the kind's defaults field by field; see `HookRequirement`.
 */
export type HookPlacement = Partial<
  Pick<
    HookRequirement,
    "minDistanceFromDeploy" | "maxNearestDistanceFromDeploy"
  >
>;

/**
 * One mission type's map behaviour, in one module under
 * `mapgen/service/missions/` (ADR 0013 §2.3). Pure and deterministic:
 * it reads the mission and its type and never draws from an RNG, so the
 * recipe a save stores is a function of the mission alone.
 *
 * ```
 *   Mission + MissionType ──► rule.recipe ──► { archetype, extraHooks, site?, landmark?, hookPlacement?, size?, hooks? }
 *                                                  │
 *                  missionToMapRecipe ◄────────────┘  + requiredHooks, carcass, size, biome
 * ```
 */
export interface MissionMapRule {
  /** The type this rule serves; equal to its key in the table. */
  readonly typeId: MissionTypeId;

  /**
   * The type-specific part of the mission's map recipe.
   */
  recipe(mission: Mission, type: MissionType): MissionMapPlan;
}

/**
 * Every mission type's map rule. A `Record` over the closed id union, so
 * a new type without a map rule is a compile error. The adapter takes
 * the table as a parameter so tests can substitute one.
 */
export type MissionMapRules = Readonly<Record<MissionTypeId, MissionMapRule>>;

import type {
  MissionHookRequirement,
  MissionType,
} from "../../content/model/mission-type";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { Mission } from "../../overworld/model/mission";
import type { MapArchetype } from "./map-recipe";

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
}

/**
 * One mission type's map behaviour, in one module under
 * `mapgen/service/missions/` (ADR 0013 §2.3). Pure and deterministic:
 * it reads the mission and its type and never draws from an RNG, so the
 * recipe a save stores is a function of the mission alone.
 *
 * ```
 *   Mission + MissionType ──► rule.recipe ──► { archetype, extraHooks, site?, landmark? }
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

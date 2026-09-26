import type {
  MissionMapRule,
  MissionMapRules,
} from "../model/mission-map-rule";

// ===========================================
// Stage-bound map rules (ADR 0013 amendment)
// ===========================================

/**
 * The map rules with every rule's `stage` fixed (#1179), so the
 * adapter, which asks a rule for its plan by mission and type alone,
 * builds the map of one stage of a linked mission. Stage 0 is every
 * rule exactly as given, so a one-map mission, and the first stage of
 * a linked one, get the recipe they always did.
 *
 * ```
 *   stage 0 ──► rules, untouched
 *   stage n ──► { [type]: { typeId, recipe: (m, t) ──► rule.recipe(m, t, n) } }
 * ```
 *
 * @param rules - The map rules to bind.
 * @param stage - The zero-based stage to build.
 * @returns Rules that ask each type for that stage's plan.
 */
export function mapRulesForStage(
  rules: MissionMapRules,
  stage: number,
): MissionMapRules {
  if (stage === 0) {
    return rules;
  }
  const bound: Partial<Record<keyof MissionMapRules, MissionMapRule>> = {};
  for (const typeId of Object.keys(rules) as (keyof MissionMapRules)[]) {
    const rule = rules[typeId];
    bound[typeId] = {
      typeId: rule.typeId,
      /** The rule's plan for the bound stage. */
      recipe: (mission, type) => rule.recipe(mission, type, stage),
    };
  }
  return bound as MissionMapRules;
}

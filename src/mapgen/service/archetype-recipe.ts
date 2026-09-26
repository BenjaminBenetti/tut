import type { ArchetypeRecipeDefaultsTable } from "../model/archetype-recipe-defaults";
import type { MapRecipe } from "../model/map-recipe";

// ===========================================
// Archetype recipe defaults
// ===========================================

/**
 * The recipe with its archetype's board and hooks in place of the
 * caller's (#1179), or the recipe itself when the table has nothing for
 * that archetype. The preview harness builds every recipe from a size
 * preset and the settlement mission's hooks; this is how a hive cavern
 * still opens on its own board with a hive core.
 *
 * ```
 *   { archetype: "hive-cavern", size: "medium", hooks: settlement }
 *     ─► { archetype: "hive-cavern", size: 64 × 144, hooks: hive cavern }
 * ```
 */
export function withArchetypeDefaults(
  recipe: MapRecipe,
  table: ArchetypeRecipeDefaultsTable,
): MapRecipe {
  const defaults = table[recipe.params.archetype];
  if (defaults === undefined) return recipe;
  return {
    ...recipe,
    params: { ...recipe.params, size: defaults.size, hooks: defaults.hooks },
  };
}

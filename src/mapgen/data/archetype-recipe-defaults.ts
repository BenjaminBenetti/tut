import type { ArchetypeRecipeDefaultsTable } from "../model/archetype-recipe-defaults";
import { HIVE_CAVERN_HOOKS, HIVE_CAVERN_SIZE } from "./hive-cavern-recipe";

// ===========================================
// Archetype recipe defaults
// ===========================================

/**
 * Archetypes whose board and hooks differ from a settlement's (#1179).
 * Settlements and the crash-site prototype are absent: their callers
 * choose a size preset and the mission's hooks.
 */
export const ARCHETYPE_RECIPE_DEFAULTS: ArchetypeRecipeDefaultsTable = {
  "hive-cavern": { size: HIVE_CAVERN_SIZE, hooks: HIVE_CAVERN_HOOKS },
};

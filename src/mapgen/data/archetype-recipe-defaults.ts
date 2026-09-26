import type { ArchetypeRecipeDefaultsTable } from "../model/archetype-recipe-defaults";
import {
  GREAT_HIVE_CAVERN_HOOKS,
  GREAT_HIVE_CAVERN_SIZE,
} from "./great-hive-cavern-recipe";
import { HIVE_CAVERN_HOOKS, HIVE_CAVERN_SIZE } from "./hive-cavern-recipe";
import {
  SPORE_PLATFORM_CORE_HOOKS,
  SPORE_PLATFORM_CORE_SIZE,
  SPORE_PLATFORM_HULL_HOOKS,
  SPORE_PLATFORM_HULL_SIZE,
} from "./spore-platform-recipe";

// ===========================================
// Archetype recipe defaults
// ===========================================

/**
 * Archetypes whose board and hooks differ from a settlement's (#1179):
 * the hive cavern and the spore platform's two stages.
 * Settlements and the crash-site prototype are absent: their callers
 * choose a size preset and the mission's hooks.
 */
export const ARCHETYPE_RECIPE_DEFAULTS: ArchetypeRecipeDefaultsTable = {
  "hive-cavern": { size: HIVE_CAVERN_SIZE, hooks: HIVE_CAVERN_HOOKS },
  "spore-platform-hull": {
    size: SPORE_PLATFORM_HULL_SIZE,
    hooks: SPORE_PLATFORM_HULL_HOOKS,
  },
  "spore-platform-core": {
    size: SPORE_PLATFORM_CORE_SIZE,
    hooks: SPORE_PLATFORM_CORE_HOOKS,
  },
  "great-hive-cavern": {
    size: GREAT_HIVE_CAVERN_SIZE,
    hooks: GREAT_HIVE_CAVERN_HOOKS,
  },
};

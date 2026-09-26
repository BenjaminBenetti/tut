import { GREAT_HIVE_CAVERN_TUNING } from "../data/great-hive-cavern-tuning";
import type { GenerationPass } from "../model/generation-pass";
import { createHiveCavernPasses } from "./hive-cavern-pipeline";

// ===========================================
// Great Hive cavern pass list
// ===========================================

/**
 * The ordered passes of the `great-hive-cavern` archetype (campaign arc
 * §6.9): the hive cavern's passes over `GREAT_HIVE_CAVERN_TUNING`, so a
 * Great Hive is the same kind of place, only bigger.
 */
export function createGreatHiveCavernPasses(): GenerationPass[] {
  return createHiveCavernPasses(GREAT_HIVE_CAVERN_TUNING);
}

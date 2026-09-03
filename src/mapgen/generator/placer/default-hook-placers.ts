import type { HookPlacer } from "../../model/hook-placer";
import { DeployPlacer } from "./deploy-placer";
import { EdgeSpawnPlacer } from "./edge-spawn-placer";
import { EggSpawnerPlacer } from "./egg-spawner-placer";
import { ExtractionPlacer } from "./extraction-placer";

// ===========================================
// Default hook placers
// ===========================================

/**
 * The placers M1.5 ships, in no particular order; the hook pass sorts by
 * priority. A new hook kind is a new class in this folder plus one entry
 * here.
 */
export const DEFAULT_HOOK_PLACERS: readonly HookPlacer[] = [
  new DeployPlacer(),
  new EggSpawnerPlacer(),
  new EdgeSpawnPlacer(),
  new ExtractionPlacer(),
];

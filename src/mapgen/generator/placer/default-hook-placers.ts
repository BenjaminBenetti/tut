import type { HookPlacer } from "../../model/hook-placer";
import { DeployPlacer } from "./deploy-placer";
import { EdgeSpawnPlacer } from "./edge-spawn-placer";
import { EggSpawnerPlacer } from "./egg-spawner-placer";
import { ExtractionPlacer } from "./extraction-placer";
import { GeneratorPlacer } from "./generator-placer";
import { SporePodPlacer } from "./spore-pod-placer";
import { TechCarcassPlacer } from "./tech-carcass-placer";

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
  new TechCarcassPlacer(),
  new GeneratorPlacer(),
  new SporePodPlacer(),
];

import { HIVE_CAVERN_TUNING } from "../data/hive-cavern-tuning";
import { BroodChamberPass } from "../generator/cavern/brood-chamber-pass";
import { CavernDressingPass } from "../generator/cavern/cavern-dressing-pass";
import { CavernPass } from "../generator/cavern/cavern-pass";
import { ConnectivityPass } from "../generator/connectivity-pass";
import { DropshipSitePass } from "../generator/dropship-site-pass";
import { HookPass } from "../generator/hook-pass";
import { EggSpawnerPlacer } from "../generator/placer/egg-spawner-placer";
import { RampPass } from "../generator/ramp-pass";
import { SlopePass } from "../generator/slope-pass";
import { TerrainPass } from "../generator/terrain-pass";
import type { GenerationPass } from "../model/generation-pass";
import type { HiveCavernTuning } from "../model/hive-cavern-tuning";
import { isBroodFloor } from "./cavern-queries";

// ===========================================
// Hive cavern pass list
// ===========================================

/**
 * The ordered passes of the hive-cavern archetype (#1179): an open-topped
 * chain of chambers cut into rock, for Hive Assault. It keeps the
 * settlement list's tail — slopes, ramps, hooks, connectivity — and
 * replaces the town with a cavern, its dressing and its brood chambers.
 *
 * ```
 *   terrain ─► cavern ─► dropship-sites (mouth edge only) ─► cavern-dressing
 *     ─► slopes ─► ramps ─► hooks (eggs in chambers) ─► brood-chambers ─► connectivity
 * ```
 *
 * The terrain pass only lends the mouth its biome's ground; the cavern
 * pass replaces its heightmap. The drop ship lands on the north edge
 * (low `z`), where the cavern pass leaves a flat pad behind the lip.
 */
export function createHiveCavernPasses(
  tuning: HiveCavernTuning = HIVE_CAVERN_TUNING,
): GenerationPass[] {
  return [
    new TerrainPass(),
    new CavernPass(tuning),
    new DropshipSitePass("elevation", ["n"]),
    new CavernDressingPass(tuning),
    new SlopePass(),
    new RampPass(),
    new HookPass([new EggSpawnerPlacer(isBroodFloor)]),
    new BroodChamberPass(),
    new ConnectivityPass(),
  ];
}

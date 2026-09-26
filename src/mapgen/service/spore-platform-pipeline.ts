import { SPORE_PLATFORM_TUNING } from "../data/spore-platform-tuning";
import { ConnectivityPass } from "../generator/connectivity-pass";
import { DropshipSitePass } from "../generator/dropship-site-pass";
import { HookPass } from "../generator/hook-pass";
import { EggSpawnerPlacer } from "../generator/placer/egg-spawner-placer";
import { PlatformPadPlacer } from "../generator/placer/platform-pad-placer";
import { CoreChamberPass } from "../generator/platform/core-chamber-pass";
import { HullDeckPass } from "../generator/platform/hull-deck-pass";
import { PlatformDressingPass } from "../generator/platform/platform-dressing-pass";
import { RampPass } from "../generator/ramp-pass";
import type { GenerationPass } from "../model/generation-pass";
import { HookKinds } from "../model/hook";
import type { SporePlatformTuning } from "../model/spore-platform-tuning";
import { isPodBed } from "./platform-queries";

// ===========================================
// Constants
// ===========================================

/** The deploy pad at the core's causeway start: 4×4, sixteen tiles. */
const CORE_DEPLOY_SIZE = 4;

// ===========================================
// Spore platform pass lists
// ===========================================

/**
 * The ordered passes of the spore platform's hull (#1179), the finale's
 * first stage: a deck of terraced plates over void, the drop ship docked
 * at the prow, dressed with the infestation kit, then the settlement
 * list's tail — ramps, hooks, connectivity. No terrain or slope pass:
 * the hull is its own relief, and plate terraces stay crisp.
 *
 * ```
 *   hull-deck ─► dropship-sites (prow edge only) ─► platform-dressing
 *     ─► ramps ─► hooks (pods on pod beds) ─► connectivity
 * ```
 */
export function createSporePlatformHullPasses(
  tuning: SporePlatformTuning = SPORE_PLATFORM_TUNING,
): GenerationPass[] {
  return [
    new HullDeckPass(tuning),
    new DropshipSitePass("elevation", ["n"]),
    new PlatformDressingPass(tuning, ["landing-sites"]),
    new RampPass(),
    new HookPass([new EggSpawnerPlacer(isPodBed)]),
    new ConnectivityPass(),
  ];
}

/**
 * The ordered passes of the spore platform's core chamber (#1179), the
 * finale's second stage: the chamber and its causeway over void, dressed
 * with the carapace kit, then ramps, hooks and connectivity. No drop
 * ship: deploy is the planned pad at the causeway's start, and the wall
 * pods stand in the rim's niches.
 *
 * ```
 *   core-chamber ─► platform-dressing ─► ramps
 *     ─► hooks (deploy on the start pad, pods in niches) ─► connectivity
 * ```
 */
export function createSporePlatformCorePasses(
  tuning: SporePlatformTuning = SPORE_PLATFORM_TUNING,
): GenerationPass[] {
  return [
    new CoreChamberPass(tuning),
    new PlatformDressingPass(tuning),
    new RampPass(),
    new HookPass([
      new PlatformPadPlacer(
        HookKinds.DEPLOY,
        CORE_DEPLOY_SIZE,
        0,
        "deployZones",
      ),
      new EggSpawnerPlacer(isPodBed),
    ]),
    new ConnectivityPass(),
  ];
}

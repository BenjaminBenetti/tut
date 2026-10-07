import { GREAT_POD_TUNING } from "../data/great-pod-tuning";
import { ConnectivityPass } from "../generator/connectivity-pass";
import { DebrisPass } from "../generator/debris-pass";
import { DropshipSitePass } from "../generator/dropship-site-pass";
import { GreatPodChamberPass } from "../generator/great-pod/great-pod-chamber-pass";
import { GreatPodPass } from "../generator/great-pod/great-pod-pass";
import { GreatPodSitePass } from "../generator/great-pod/great-pod-site-pass";
import { HookPass } from "../generator/hook-pass";
import { InfestationPass } from "../generator/infestation-pass";
import { InfestationPlanPass } from "../generator/infestation-plan-pass";
import { GreatPodCorePlacer } from "../generator/placer/great-pod-core-placer";
import { RampPass } from "../generator/ramp-pass";
import { SlopePass } from "../generator/slope-pass";
import { TerrainPass } from "../generator/terrain-pass";
import { WaterPass } from "../generator/water-pass";
import type { GenerationPass } from "../model/generation-pass";
import type { GreatPodTuning } from "../model/great-pod-tuning";

// ===========================================
// Great pod pass list
// ===========================================

/**
 * The ordered passes of the great-pod archetype (#1238): a crash site
 * whose pod came down whole, a sealed structure the squad breaches,
 * enters and guts. It keeps the crash site's open ground, debris and
 * tail (slopes, ramps, hooks, colony, connectivity), and replaces the
 * crater with the pod.
 *
 * ```
 *   terrain ─► water ─► dropship-sites ─► great-pod-site
 *     ─► infestation-plan ─► debris ─► great-pod ─► slopes ─► ramps
 *     ─► hooks (the core) ─► great-pod-chambers ─► infestation ─► connectivity
 * ```
 *
 * The drop ship lands first, on whichever edge the terrain offers, so
 * the pod is placed from the landing: one move from the boarding ramp
 * whatever the terrain made of the edges. The site pass levels the pod's
 * disc and reserves it before the colony plans its ground; the debris
 * pass then strews the whole board and the pod pass clears its own disc
 * of it before building.
 */
export function createGreatPodPasses(
  tuning: GreatPodTuning = GREAT_POD_TUNING,
): GenerationPass[] {
  return [
    new TerrainPass(),
    new WaterPass(),
    new DropshipSitePass("water"),
    new GreatPodSitePass(tuning),
    new InfestationPlanPass(),
    new DebrisPass(),
    new GreatPodPass(tuning),
    new SlopePass(),
    new RampPass(),
    new HookPass([new GreatPodCorePlacer()]),
    new GreatPodChamberPass(),
    new InfestationPass(),
    new ConnectivityPass(),
  ];
}

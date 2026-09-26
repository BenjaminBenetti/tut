import type { CityId } from "../model/city";
import type { EarthMap } from "../model/earth-map";
import type { OverworldState } from "../model/overworld-state";
import type { RegionId } from "../model/region";
import type { CityGrowthFactor } from "./infestation-growth-service";

// ===========================================
// Queries
// ===========================================

/**
 * The regions whose growth is paused on tick day `day` (campaign arc
 * §6.5: a liberated region's growth pauses). A region is paused while
 * `day` is before the day `growthPausedUntil` names for it; an entry on
 * or before `day` is a pause that has already lifted.
 *
 * ```
 *   liberated on day 20, pause 10 ──► growthPausedUntil = 31
 *   tick day 21 … 30 ──► paused (10 days)      tick day 31 ──► grows again
 * ```
 */
export function pausedRegions(
  overworld: Pick<OverworldState, "growthPausedUntil">,
  day: number,
): ReadonlySet<RegionId> {
  const paused = new Set<RegionId>();
  for (const [regionId, resumesOn] of Object.entries(
    overworld.growthPausedUntil ?? {},
  )) {
    if (day < resumesOn) {
      paused.add(regionId);
    }
  }
  return paused;
}

// ===========================================
// Growth
// ===========================================

/**
 * The day's growth factors with every city of a paused region held at 0,
 * so the growth service leaves it where it is. Cities elsewhere keep
 * their factor. Returns `factors` itself when no region is paused, so a
 * campaign that never liberates a region grows exactly as before.
 */
export function withPausedGrowth(
  map: EarthMap,
  factors: CityGrowthFactor,
  paused: ReadonlySet<RegionId>,
): CityGrowthFactor {
  if (paused.size === 0) {
    return factors;
  }
  const next: Record<CityId, number> = { ...factors };
  for (const city of map.cities) {
    if (paused.has(city.regionId)) {
      next[city.id] = 0;
    }
  }
  return next;
}

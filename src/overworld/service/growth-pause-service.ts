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
// Pauses
// ===========================================

/**
 * Holds `regionId`'s growth and outward spread for `days` days counted
 * from the day after `day` (campaign arc §6.8: a dead Broodmother's
 * region "growth drops"). The hive model's own timed modifier, the one
 * a liberation sets; a pause already running longer is kept, so a
 * shorter one never cuts a liberation short.
 *
 * ```
 *   growthPausedUntil[region] = max(current, day + days + 1)
 *   killed on day 20, 5 days ──► 26: ticks 21 … 25 paused, 26 grows again
 * ```
 *
 * @param overworld - The overworld; never mutated.
 * @param regionId - The region to hold.
 * @param day - The day the pause is set; the first held tick is `day + 1`.
 * @param days - Days to hold, at least 1; `0` or less changes nothing.
 * @returns The overworld with the pause, or `overworld` itself when it
 *   would change nothing.
 */
export function pauseRegionGrowth(
  overworld: OverworldState,
  regionId: RegionId,
  day: number,
  days: number,
): OverworldState {
  const resumesOn = day + days + 1;
  const current = overworld.growthPausedUntil?.[regionId];
  if (days <= 0 || (current !== undefined && current >= resumesOn)) {
    return overworld;
  }
  return {
    ...overworld,
    growthPausedUntil: {
      ...overworld.growthPausedUntil,
      [regionId]: resumesOn,
    },
  };
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

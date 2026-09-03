import type { CityId } from "./city";

// ===========================================
// Spread cooldowns
// ===========================================

/**
 * Days each city must still wait before it may spread again, keyed by
 * city id (GDD §5.3). A city with no entry is off cooldown; entries are
 * positive integers and are removed once they reach zero. Stored on
 * `OverworldState` and advanced by the spread service each day.
 */
export type SpreadCooldowns = Readonly<Record<CityId, number>>;

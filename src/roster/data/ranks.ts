import type { RankLadder } from "../model/rank";

// ===========================================
// Ranks (GDD §5.7)
// ===========================================

/**
 * The enlisted ladder every squad and mech pilot climbs (#1130), from
 * the lowest. Thresholds are in experience, and a swarmer is worth 10,
 * so the first kill promotes and every rank after costs one more
 * swarmer than the last:
 *
 * ```
 *   rank   0    1    2    3    4     5     6     7     8
 *   xp     0   10   30   60  100   150   210   280   360
 *   step       10   20   30   40    50    60    70    80    (one swarmer more each time)
 * ```
 *
 * Quick at first so a green squad feels its first fight, slowing so a
 * veteran is earned over a campaign rather than a mission. The rank
 * index is what the field bonuses scale with (`RANK_TUNING`).
 */
export const RANKS: RankLadder = [
  { id: "private", name: "Private", xp: 0 },
  { id: "private-first-class", name: "Private First Class", xp: 10 },
  { id: "corporal", name: "Corporal", xp: 30 },
  { id: "sergeant", name: "Sergeant", xp: 60 },
  { id: "staff-sergeant", name: "Staff Sergeant", xp: 100 },
  { id: "sergeant-first-class", name: "Sergeant First Class", xp: 150 },
  { id: "master-sergeant", name: "Master Sergeant", xp: 210 },
  { id: "first-sergeant", name: "First Sergeant", xp: 280 },
  { id: "sergeant-major", name: "Sergeant Major", xp: 360 },
];

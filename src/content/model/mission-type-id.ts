// ===========================================
// Mission type id
// ===========================================

/**
 * Mission types the game ships (GDD §5.4). A closed union so the
 * `MISSION_TYPES` record in `content/data/mission-types` must define every
 * member; adding a type (M3: hive assault, rescue) is one new member here
 * plus one entry there, and the compiler flags any table keyed by this id
 * that forgets it. `defend-installation` (#1175) is the first M3 type:
 * waves of bugs against the generators of an installation the player
 * built. `crash-site` (campaign arc §6.3) is a spore pod come down near
 * a city, to be destroyed before it matures at the end of turn 8.
 */
export type MissionTypeId =
  "infestation-clearance" | "defend-installation" | "crash-site";

/**
 * Every mission type id, in a fixed order. The order is the order the
 * generation tick rolls the types in, so it is part of the determinism
 * contract: append, never insert.
 */
export const MISSION_TYPE_IDS: readonly MissionTypeId[] = [
  "infestation-clearance",
  "defend-installation",
  "crash-site",
];

// ===========================================
// Mission type id
// ===========================================

/**
 * Mission types the game ships (GDD §5.4). A closed union so the
 * `MISSION_TYPES` record in `content/data/mission-types` must define every
 * member; adding a type (M3: hive assault, crash site, rescue, defend) is
 * one new member here plus one entry there, and the compiler flags any
 * table keyed by this id that forgets it.
 */
export type MissionTypeId = "infestation-clearance";

/** Every mission type id, in a fixed order. */
export const MISSION_TYPE_IDS: readonly MissionTypeId[] = [
  "infestation-clearance",
];

// ===========================================
// Room kind ids
// ===========================================

/**
 * Ids of the room kinds the interior pass assigns. Furnishing data is keyed
 * by them so a new kind fails to compile until it says what goes in it.
 */
export const RoomKindIds = {
  /** The room the entrance opens into. */
  HALL: "hall",
  /** Any other living or working room. */
  ROOM: "room",
  /** Warehouses throughout and a shop's back rooms. */
  STORAGE: "storage",
} as const;

/** One of the shipped room kind ids. */
export type KnownRoomKindId = (typeof RoomKindIds)[keyof typeof RoomKindIds];

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
  /** A corridor that rooms open onto and stairs land in (#829). */
  CORRIDOR: "corridor",
  RETAIL: "retail",
  OFFICE: "office",
  RECEPTION: "reception",
  MEETING: "meeting",
  BREAK_ROOM: "break-room",
  LIVING_ROOM: "living-room",
  BEDROOM: "bedroom",
  KITCHEN: "kitchen",
  BATHROOM: "bathroom",
  WORKSHOP: "workshop",
} as const;

/** One of the shipped room kind ids. */
export type KnownRoomKindId = (typeof RoomKindIds)[keyof typeof RoomKindIds];

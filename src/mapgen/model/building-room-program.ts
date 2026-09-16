/** The uses of rooms on a floor, independently of its geometric partition. */
export interface BuildingRoomProgram {
  /** Public-facing room nearest the entrance, or the first room upstairs. */
  readonly arrival: string;
  /** Essential uses assigned once each, in priority order. */
  readonly primary: readonly string[];
  /** Uses repeated in seeded order after essential rooms have been assigned. */
  readonly repeat: readonly string[];
  /** A service room assigned to the smallest private room on larger floors. */
  readonly compact?: { readonly kind: string; readonly minRooms: number };
}

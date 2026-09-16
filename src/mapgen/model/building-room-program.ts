/** The uses of rooms on a floor, independently of its geometric partition. */
export interface BuildingRoomProgram {
  /** Public-facing room nearest the entrance, or the first room upstairs. */
  readonly arrival: string;
  /** Essential uses assigned once each, in priority order. */
  readonly primary: readonly string[];
  /** Uses repeated in seeded order after essential rooms have been assigned. */
  readonly repeat: readonly string[];
  /** Uses tied to architectural slots, before remaining rooms are assigned. */
  readonly roomSlots?: Readonly<Record<string, string>>;
  /** A service room assigned to the smallest private room on larger floors. */
  readonly compact?: { readonly kind: string; readonly minRooms: number };
}

/** A coherent business identity shared by all floors of one building. */
export interface BuildingInteriorVariant {
  readonly id: string;
  readonly ground: BuildingRoomProgram;
  readonly upper: BuildingRoomProgram;
}

/** Identifies one save slot, e.g. `"slot-1"` or `"autosave"`. */
export type SaveSlotId = string;

/** Enough about a slot to list it without decoding the whole state. */
export interface SaveSlotSummary {
  readonly id: SaveSlotId;
  readonly savedAt: string;
  readonly schemaVersion: number;
}

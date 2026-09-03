import type { SaveSlotId } from "../model/save-slot";

/**
 * Slot the app writes automatically when a campaign starts or advances,
 * and the one "Continue" on the main menu loads from.
 */
export const AUTOSAVE_SLOT_ID: SaveSlotId = "autosave";

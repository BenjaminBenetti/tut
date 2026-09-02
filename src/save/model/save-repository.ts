import type { SaveSlotId } from "./save-slot";

/**
 * Persists encoded save text by slot. Knows nothing about the state's
 * shape; the codec owns that. Implementations decide where bytes go.
 */
export interface SaveRepository {
  /** Lists the ids of every slot that has data. */
  listIds(): readonly SaveSlotId[];

  /** Returns the encoded text for a slot, or undefined when empty. */
  read(id: SaveSlotId): string | undefined;

  /** Writes encoded text to a slot, replacing any previous save. */
  write(id: SaveSlotId, text: string): void;

  /** Deletes a slot; a no-op when already empty. */
  remove(id: SaveSlotId): void;
}

import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { SaveError } from "../model/save-error";
import type { SaveRepository } from "../model/save-repository";
import type { SaveSlotId, SaveSlotSummary } from "../model/save-slot";
import type { SaveCodec } from "./save-codec";

// ===========================================
// SaveService
// ===========================================

/**
 * The save/load facade the app talks to. Composes a codec (shape) with
 * a repository (bytes) so either can change independently.
 *
 * ```
 *   app ──save(slot, state)──► SaveService ──encode──► codec
 *                                   │                    │
 *                                   └──write(slot, text)─┴──► repository
 * ```
 */
export class SaveService<TState> {
  // ===========================================
  // Construction
  // ===========================================

  /** Wires a codec to a repository. */
  constructor(
    private readonly codec: SaveCodec<TState>,
    private readonly repository: SaveRepository,
  ) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /** Encodes and stores the state in a slot. Storage failures are reported, not thrown. */
  save(
    id: SaveSlotId,
    state: TState,
    savedAt: string,
  ): Result<void, SaveError> {
    const text = this.codec.encode(state, savedAt);
    try {
      this.repository.write(id, text);
    } catch (cause) {
      return err({ kind: "storage", message: describe(cause) });
    }
    return ok(undefined);
  }

  /** Loads and migrates the state in a slot. */
  load(id: SaveSlotId): Result<TState, SaveError> {
    const text = this.repository.read(id);
    if (text === undefined) {
      return err({ kind: "missing", message: `No save in slot "${id}"` });
    }
    const decoded = this.codec.decode(text);
    return decoded.ok ? ok(decoded.value.state) : decoded;
  }

  /** Lists every readable slot with its timestamp; unreadable slots are skipped. */
  listSlots(): readonly SaveSlotSummary[] {
    const summaries: SaveSlotSummary[] = [];
    for (const id of this.repository.listIds()) {
      const text = this.repository.read(id);
      if (text === undefined) {
        continue;
      }
      const decoded = this.codec.decode(text);
      if (decoded.ok) {
        summaries.push({
          id,
          savedAt: decoded.value.savedAt,
          schemaVersion: decoded.value.schemaVersion,
        });
      }
    }
    return summaries;
  }

  /** Deletes a slot. */
  deleteSlot(id: SaveSlotId): void {
    this.repository.remove(id);
  }
}

// ===========================================
// Helpers
// ===========================================

/** Renders a thrown value as a message without assuming it is an Error. */
function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

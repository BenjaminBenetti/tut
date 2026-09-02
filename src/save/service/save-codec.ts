import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { SaveEnvelope } from "../model/save-envelope";
import type { SaveError } from "../model/save-error";
import type { MigrationRunner } from "./migration-runner";

// ===========================================
// SaveCodec
// ===========================================

/**
 * Turns state into storable text and back. Decoding validates the
 * envelope shape and runs migrations; the migrated state is trusted to
 * match `TState` because the migration chain is the codebase's own
 * declaration of what each version looks like.
 */
export class SaveCodec<TState> {
  // ===========================================
  // Construction
  // ===========================================

  /** Binds the codec to the current schema version and its migration chain. */
  constructor(
    private readonly schemaVersion: number,
    private readonly migrations: MigrationRunner,
  ) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /** Wraps the state in an envelope and serializes it as JSON. */
  encode(state: TState, savedAt: string): string {
    const envelope: SaveEnvelope<TState> = {
      schemaVersion: this.schemaVersion,
      savedAt,
      state,
    };
    return JSON.stringify(envelope);
  }

  /** Parses, validates, and migrates text into a current-version envelope. */
  decode(text: string): Result<SaveEnvelope<TState>, SaveError> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return err({ kind: "parse", message: "Save text is not valid JSON" });
    }
    if (!isEnvelope(parsed)) {
      return err({
        kind: "malformed",
        message: "Save is missing schemaVersion, savedAt, or state",
      });
    }
    const migrated = this.migrations.migrate(parsed);
    if (!migrated.ok) {
      return migrated;
    }
    return ok(migrated.value as SaveEnvelope<TState>);
  }
}

// ===========================================
// Helpers
// ===========================================

/** Structural check that parsed JSON looks like an envelope. */
function isEnvelope(value: unknown): value is SaveEnvelope<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.schemaVersion === "number" &&
    Number.isInteger(record.schemaVersion) &&
    typeof record.savedAt === "string" &&
    "state" in record
  );
}

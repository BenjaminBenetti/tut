import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { Migration } from "../model/migration";
import type { SaveEnvelope } from "../model/save-envelope";
import type { SaveError } from "../model/save-error";

// ===========================================
// MigrationRunner
// ===========================================

/**
 * Brings an envelope forward to the target schema version by applying
 * a contiguous chain of migrations. The chain is validated once at
 * construction so a gap is a startup error, not a load-time surprise.
 *
 * ```
 *   v1 ──m(1→2)──► v2 ──m(2→3)──► v3   (target)
 * ```
 */
export class MigrationRunner {
  // ===========================================
  // Fields
  // ===========================================

  private readonly byFrom: ReadonlyMap<number, Migration>;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Indexes migrations by their `from` version and checks that they
   * form an unbroken chain ending at `targetVersion`.
   */
  constructor(
    migrations: readonly Migration[],
    private readonly targetVersion: number,
  ) {
    const byFrom = new Map<number, Migration>();
    for (const migration of migrations) {
      if (migration.to !== migration.from + 1) {
        throw new Error(
          `Migration ${migration.from}→${migration.to} must advance exactly one version`,
        );
      }
      if (byFrom.has(migration.from)) {
        throw new Error(`Duplicate migration from version ${migration.from}`);
      }
      byFrom.set(migration.from, migration);
    }
    const lowest = Math.min(targetVersion, ...byFrom.keys());
    for (let v = lowest; v < targetVersion; v++) {
      if (!byFrom.has(v)) {
        throw new Error(`Missing migration from version ${v}`);
      }
    }
    this.byFrom = byFrom;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Applies migrations until the envelope reaches the target version.
   * Envelopes newer than the target are refused rather than guessed at.
   */
  migrate(
    envelope: SaveEnvelope<unknown>,
  ): Result<SaveEnvelope<unknown>, SaveError> {
    if (envelope.schemaVersion > this.targetVersion) {
      return err({
        kind: "unsupported-version",
        message: `Save is schema v${envelope.schemaVersion}; this build reads up to v${this.targetVersion}`,
      });
    }
    let current = envelope;
    while (current.schemaVersion < this.targetVersion) {
      const step = this.byFrom.get(current.schemaVersion);
      if (!step) {
        return err({
          kind: "unsupported-version",
          message: `No migration path from schema v${current.schemaVersion}`,
        });
      }
      try {
        current = {
          schemaVersion: step.to,
          savedAt: current.savedAt,
          state: step.apply(current.state),
        };
      } catch (cause) {
        return err({
          kind: "migration-failed",
          message: `Migration ${step.from}→${step.to} failed: ${describe(cause)}`,
        });
      }
    }
    return ok(current);
  }
}

// ===========================================
// Helpers
// ===========================================

/** Renders a thrown value as a message without assuming it is an Error. */
function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

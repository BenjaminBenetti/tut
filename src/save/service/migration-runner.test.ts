import { describe, expect, it } from "vitest";

import type { Migration } from "../model/migration";
import { MigrationRunner } from "./migration-runner";

const addField = (from: number, field: string): Migration => ({
  from,
  to: from + 1,
  apply: (state) => ({ ...(state as Record<string, unknown>), [field]: true }),
});

describe("MigrationRunner", () => {
  it("applies a contiguous chain in order", () => {
    const runner = new MigrationRunner([addField(2, "b"), addField(1, "a")], 3);
    const result = runner.migrate({
      schemaVersion: 1,
      savedAt: "t",
      state: {},
    });
    expect(result).toEqual({
      ok: true,
      value: { schemaVersion: 3, savedAt: "t", state: { a: true, b: true } },
    });
  });

  it("leaves a current-version envelope untouched", () => {
    const runner = new MigrationRunner([addField(1, "a")], 2);
    const envelope = { schemaVersion: 2, savedAt: "t", state: { x: 1 } };
    expect(runner.migrate(envelope)).toEqual({ ok: true, value: envelope });
  });

  it("refuses envelopes newer than the target", () => {
    const runner = new MigrationRunner([], 1);
    const result = runner.migrate({
      schemaVersion: 2,
      savedAt: "t",
      state: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("unsupported-version");
    }
  });

  it("rejects gaps, duplicates, and multi-step migrations at construction", () => {
    expect(() => new MigrationRunner([addField(1, "a")], 3)).toThrow(/Missing/);
    expect(
      () => new MigrationRunner([addField(1, "a"), addField(1, "b")], 2),
    ).toThrow(/Duplicate/);
    expect(
      () => new MigrationRunner([{ from: 1, to: 3, apply: (s) => s }], 3),
    ).toThrow(/exactly one/);
  });

  it("reports a throwing migration as migration-failed", () => {
    const boom: Migration = {
      from: 1,
      to: 2,
      apply: () => {
        throw new Error("kaboom");
      },
    };
    const runner = new MigrationRunner([boom], 2);
    const result = runner.migrate({
      schemaVersion: 1,
      savedAt: "t",
      state: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("migration-failed");
      expect(result.error.message).toMatch(/kaboom/);
    }
  });
});

import { describe, expect, it } from "vitest";

import { MigrationRunner } from "./migration-runner";
import { SaveCodec } from "./save-codec";

interface Shape {
  readonly hp: number;
}

const codec = (): SaveCodec<Shape> =>
  new SaveCodec(1, new MigrationRunner([], 1));

describe("SaveCodec", () => {
  it("round-trips state through text", () => {
    const c = codec();
    const text = c.encode({ hp: 7 }, "2026-09-02T00:00:00Z");
    expect(c.decode(text)).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        savedAt: "2026-09-02T00:00:00Z",
        state: { hp: 7 },
      },
    });
  });

  it("classifies bad input", () => {
    const c = codec();
    const kinds = [
      c.decode("not json"),
      c.decode('{"schemaVersion":"1","savedAt":"t","state":{}}'),
      c.decode('{"savedAt":"t","state":{}}'),
      c.decode("null"),
    ].map((r) => (r.ok ? "ok" : r.error.kind));
    expect(kinds).toEqual(["parse", "malformed", "malformed", "malformed"]);
  });

  it("migrates older envelopes on decode", () => {
    const runner = new MigrationRunner(
      [
        {
          from: 1,
          to: 2,
          apply: (s) => ({ ...(s as object), armor: 0 }),
        },
      ],
      2,
    );
    const c = new SaveCodec<{ hp: number; armor: number }>(2, runner);
    const result = c.decode(
      '{"schemaVersion":1,"savedAt":"t","state":{"hp":3}}',
    );
    expect(result).toEqual({
      ok: true,
      value: { schemaVersion: 2, savedAt: "t", state: { hp: 3, armor: 0 } },
    });
  });
});

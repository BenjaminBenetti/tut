import { describe, expect, it } from "vitest";

import { DiagnosticsCollector } from "./diagnostics-collector";

describe("DiagnosticsCollector", () => {
  it("attributes notes to the pass that wrote them", () => {
    const collector = new DiagnosticsCollector();
    const terrain = collector.forPass("terrain");
    const roads = collector.forPass("roads");
    terrain.note("quantised to 3 levels");
    roads.note("flattened column", { x: 4, y: 1, z: 2 });
    expect(collector.snapshot().notes).toEqual([
      { pass: "terrain", message: "quantised to 3 levels" },
      { pass: "roads", message: "flattened column", at: { x: 4, y: 1, z: 2 } },
    ]);
  });

  it("records timings in order", () => {
    const collector = new DiagnosticsCollector();
    collector.recordTiming("terrain", 1.5);
    collector.recordTiming("roads", 0.25);
    expect(collector.snapshot().timings).toEqual([
      { pass: "terrain", durationMs: 1.5 },
      { pass: "roads", durationMs: 0.25 },
    ]);
  });

  it("returns copies so later notes do not change an earlier snapshot", () => {
    const collector = new DiagnosticsCollector();
    const sink = collector.forPass("p");
    sink.note("first");
    const early = collector.snapshot();
    sink.note("second");
    expect(early.notes).toHaveLength(1);
    expect(collector.snapshot().notes).toHaveLength(2);
  });
});

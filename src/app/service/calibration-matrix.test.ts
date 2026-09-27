/// <reference types="node" />
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CALIBRATION_CELLS } from "./calibration-cells.test-helper";
import {
  collectResults,
  GAP_CELL_ID,
  matrixRuns,
  matrixScratch,
  matrixTsv,
  playShare,
  runsPath,
  summarise,
} from "./calibration-matrix.test-helper";
import { cellPins } from "./calibration-pins.test-helper";
import type { RunResult, RunSpec } from "./calibration-run.test-helper";
import { cellAt } from "./calibration-run.test-helper";

/** The one run `spec` names: its cell, seed, player and luck. */
function keyOf(spec: RunSpec): string {
  return `${String(spec.cellIndex)}:${String(spec.seedIndex)}:${spec.player}:${spec.luck}`;
}

/** A made-up result for `spec`: the expert loses every fourth seed, the new player all. */
function fakeRun(spec: RunSpec): RunResult {
  const won = spec.player === "expert" && spec.seedIndex % 4 !== 0;
  return {
    cell: cellAt(spec.cellIndex).id,
    seedIndex: spec.seedIndex,
    player: spec.player,
    luck: spec.luck,
    difficulty: 1,
    outcome: won ? "won" : "lost",
    capped: false,
    abandoned: "",
    turns: 10,
    unitsLost: won ? 0 : 5,
    mechsLost: won ? 0 : 1,
    deployed: 5,
    bugPhaseMs: 100,
    shots: 10,
    hits: 6,
    commands: 50,
    refused: 0,
    wallMs: 1000,
  };
}

describe("the calibration matrix", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it("queues every cell for both players on every seed, plus the gap cell's expert on new luck", () => {
    const runs = matrixRuns(2);
    expect(runs).toHaveLength(CALIBRATION_CELLS.length * 2 * 2 + 2);
    const gap = runs.filter(
      (run) => run.player === "expert" && run.luck === "new",
    );
    expect(gap.map((run) => cellAt(run.cellIndex).id)).toEqual([
      GAP_CELL_ID,
      GAP_CELL_ID,
    ]);
    expect(cellAt(runs[0]!.cellIndex).id).toBe("story:great-hive/act-3");
  });

  it("shares one queue among shards, each run played once, and collects them all", () => {
    const dir = mkdtempSync(join(tmpdir(), "matrix-"));
    dirs.push(dir);
    const runs = matrixRuns(1);
    const scratch = matrixScratch(join(dir, "out.tsv"), "token");
    const played: string[] = [];
    const first = playShare(runs.slice(0, 10), scratch, (spec) => {
      played.push(keyOf(spec));
      return fakeRun(spec);
    });
    expect(collectResults(runs, scratch)).toBeUndefined();
    const rest = playShare(runs, scratch, (spec) => {
      played.push(keyOf(spec));
      return fakeRun(spec);
    });
    expect(first + rest).toBe(runs.length);
    expect(new Set(played).size).toBe(runs.length);
    expect(collectResults(runs, scratch)).toHaveLength(runs.length);
  });

  it("writes the runs beside the matrix", () => {
    expect(runsPath("docs/baseline-matrix.tsv")).toBe(
      "docs/baseline-matrix.runs.tsv",
    );
    expect(runsPath("out")).toBe("out.runs.tsv");
  });

  it("summarises each cell's players with win rates against the band's target", () => {
    const results = matrixRuns(4).map(fakeRun);
    const rows = summarise(results);
    const expert = rows.find(
      (row) => row.cell === "crash-site/act-1" && row.player === "expert",
    );
    expect(expert).toMatchObject({
      runs: 4,
      won: 3,
      lost: 1,
      winRate: 75,
      target: 90,
    });
    expect(expert?.hitRate).toBe(60);
    const tsv = matrixTsv(rows, cellPins(rows)).split("\n");
    const expertLine = tsv.find((line) =>
      line.startsWith("crash-site/act-1\tact-1\texpert\texpert"),
    );
    expect(expertLine?.split("\t").at(-1)).toBe("clear");
    expect(tsv[0]?.split("\t")).toContain("win_pct");
    expect(tsv).toHaveLength(rows.length + 2);
  });
});

/// <reference types="node" />
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CALIBRATION_CELLS } from "./calibration-cells.test-helper";
import {
  bandsPath,
  bandsTsv,
  collectResults,
  GAP_CELL_ID,
  matrixRuns,
  matrixScratch,
  matrixTsv,
  playShare,
  runsPath,
  summarise,
} from "./calibration-matrix.test-helper";
import { bandPins, cellPins } from "./calibration-pins.test-helper";
import {
  expertTargetPins,
  newPlayerBandPins,
} from "./calibration-targets.test-helper";
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
    expect(cellAt(runs[0]!.cellIndex).id).toBe("story:launch-window/finale");
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

  it("queues only the cells a filter selects, each run the one the full matrix plays", () => {
    const full = matrixRuns(2, []);
    const filtered = matrixRuns(2, ["hive-assault", GAP_CELL_ID]);
    const cells = new Set(filtered.map((run) => cellAt(run.cellIndex).id));
    expect([...cells].sort()).toEqual([
      "hive-assault/act-2",
      "hive-assault/act-3",
      GAP_CELL_ID,
    ]);
    const fullOf = new Set(full.map(keyOf));
    expect(filtered.every((run) => fullOf.has(keyOf(run)))).toBe(true);
    expect(filtered).toHaveLength(3 * 2 * 2 + 2);
    expect(filtered.map((run) => run.index)).toEqual(
      filtered.map((_, index) => index),
    );
    expect(
      matrixRuns(2, ["hive-assault"]).some((run) => run.luck !== run.player),
    ).toBe(false);
  });

  it("shares a filtered queue among more shards than it has runs", () => {
    const dir = mkdtempSync(join(tmpdir(), "matrix-"));
    dirs.push(dir);
    const runs = matrixRuns(1, ["story:uplink"]);
    const scratch = matrixScratch(join(dir, "out.tsv"), "token");
    const shares = [0, 1, 2, 3].map(() => playShare(runs, scratch, fakeRun));
    expect(shares).toEqual([2, 0, 0, 0]);
    const results = collectResults(runs, scratch);
    expect(results?.map((result) => result.cell)).toEqual([
      "story:uplink/act-3",
      "story:uplink/act-3",
    ]);
    expect(summarise(results ?? []).map((row) => row.player)).toEqual([
      "new",
      "expert",
    ]);
  });

  it("writes the runs and the bands beside the matrix", () => {
    expect(runsPath("docs/baseline-matrix.tsv")).toBe(
      "docs/baseline-matrix.runs.tsv",
    );
    expect(runsPath("out")).toBe("out.runs.tsv");
    expect(bandsPath("docs/baseline-matrix.tsv")).toBe(
      "docs/baseline-matrix.bands.tsv",
    );
  });

  it("tabulates each band: the new player against its target, the expert's cells and its lead", () => {
    const rows = summarise(matrixRuns(4).map(fakeRun));
    const tsv = bandsTsv(
      newPlayerBandPins(rows),
      bandPins(rows),
      expertTargetPins(rows),
    ).split("\n");
    const header = tsv[0]?.split("\t") ?? [];
    const act1 = tsv.find((line) => line.startsWith("act-1\t"))?.split("\t");
    const field = (name: string): string | undefined =>
      act1?.[header.indexOf(name)];
    expect(field("new_won")).toBe("0");
    expect(field("new_target_pct")).toBe("90");
    expect(field("new_target")).toBe("low");
    expect(field("expert_cells")).toBe("6");
    expect(field("expert_cells_met")).toBe("0");
    expect(field("expert_over_new")).toBe("holds");
    expect(tsv).toHaveLength(4 + 2);
  });

  it("summarises each cell's players with win rates beside both players' targets", () => {
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
      newBandTarget: 90,
      expertTarget: 90,
    });
    expect(
      rows.find((row) => row.cell === "crash-site/act-3")?.newBandTarget,
    ).toBe(65);
    expect(expert?.hitRate).toBe(60);
    const tsv = matrixTsv(rows, cellPins(rows), expertTargetPins(rows)).split(
      "\n",
    );
    const header = tsv[0]?.split("\t") ?? [];
    const column = (line: string | undefined, name: string): string =>
      line?.split("\t")[header.indexOf(name)] ?? "missing";
    const expertLine = tsv.find((line) =>
      line.startsWith("crash-site/act-1\tact-1\texpert\texpert"),
    );
    const newLine = tsv.find((line) =>
      line.startsWith("crash-site/act-3\tact-3\tnew\tnew"),
    );
    expect(column(expertLine, "pin")).toBe("clear");
    expect(column(expertLine, "expert_target")).toBe("allowance");
    expect(column(expertLine, "new_band_target_pct")).toBe("90");
    expect(column(expertLine, "expert_cell_target_pct")).toBe("90");
    expect(column(newLine, "new_band_target_pct")).toBe("65");
    expect(column(newLine, "expert_target")).toBe("");
    expect(header).toContain("win_pct");
    expect(header).not.toContain("target_pct");
    expect(tsv).toHaveLength(rows.length + 2);
  });
});

/// <reference types="node" />
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";

import { describe, expect, it } from "vitest";

import type { ForceBand } from "./calibration-forces.test-helper";
import {
  CALIBRATION_CELLS,
  parseCellFilters,
  selectCells,
} from "./calibration-cells.test-helper";
import type {
  PlayerId,
  RunResult,
  RunSpec,
} from "./calibration-run.test-helper";
import type { BandPin, CellPin } from "./calibration-pins.test-helper";
import { bandPins, cellPins, pinNotes } from "./calibration-pins.test-helper";
import { PLAYER_IDS, playRun } from "./calibration-run.test-helper";
import type {
  ExpertTargetPin,
  NewPlayerBandPin,
} from "./calibration-targets.test-helper";
import {
  EXPERT_CELL_TARGET,
  expertTargetPins,
  NEW_PLAYER_BAND_TARGETS,
  newPlayerBandPins,
  TARGETED_CELLS,
  targetedBandPins,
  targetedExpertPins,
  targetNotes,
} from "./calibration-targets.test-helper";

// ===========================================
// The calibration matrix (#1179, campaign arc §12)
// ===========================================
//
// Every cell × seed × player, plus the decision-gap cell (the expert on
// the new player's dice), shared among however many shard files vitest
// runs side by side. Each shard claims the next unplayed run by creating
// its claim file exclusively, so the runs balance themselves across the
// workers with no estimate of what each costs; the heaviest cells are
// queued first so the tail is short. Every run is deterministic, so who
// plays it never matters. The shard that writes the last result merges
// them into the TSV.
//
//   shard k ──► claim run i (open wx) ──► playRun ──► results/i.json
//      … every result in ──► merge ──► SIM_MATRIX_OUT (cells)
//                                   ──► <SIM_MATRIX_OUT less .tsv>.runs.tsv (runs)
//
// A matrix run's scratch sits in `SIM_MATRIX_OUT.parts/<token>/`; the
// token is the vitest process every shard is forked from, so a later
// run never reads an earlier one's claims. `SIM_MATRIX_CELLS` narrows
// the queue to the cells it names (see `selectCells`); the shards share
// the narrowed queue the same way.

/**
 * Seeds per cell and player. 16 by default: 784 runs, which took 738 s
 * on 8 workers for the committed baseline and 996 s for the one before
 * it under heavier load (8 seeds took 356 s on weaker forces), inside
 * the half hour a full run is allowed (the README's "Seeds").
 */
export const MATRIX_SEEDS = Number(process.env.SIM_MATRIX_SEEDS ?? "16");

/** The cells a run plays (`SIM_MATRIX_CELLS`); none named plays every cell. */
export const MATRIX_CELL_FILTERS = parseCellFilters(
  process.env.SIM_MATRIX_CELLS,
);

/**
 * The cell whose expert also plays on the new player's dice: in the
 * pilot the new player lost it and the expert won it in five turns, so a
 * gap that is luck would show here first, and the expert's runs are cheap.
 */
export const GAP_CELL_ID = "story:live-specimen/act-1";

/**
 * Cells queued first, longest mean run first, so the last runs to finish
 * are short ones (the round-2 baseline at 8bf21fba, 8 seeds, 2026-09-26):
 *
 * ```
 *   launch-window 31 s   great-hive 29 s   hive-assault/act-3 17 s
 *   defend/act-3 17 s    uplink 12 s       clearance/act-3 9 s
 *   evacuation/act-3 9 s tunnel/act-3 7 s  defend/act-2 5 s
 *   defend/act-1 4 s     evacuation/act-2 4 s   clearance/act-2 4 s
 * ```
 */
const HEAVY_FIRST: readonly string[] = [
  "story:launch-window/finale",
  "story:great-hive/act-3",
  "hive-assault/act-3",
  "defend-installation/act-3",
  "story:uplink/act-3",
  "infestation-clearance/act-3",
  "evacuation/act-3",
  "tunnel-sabotage/act-3",
  "defend-installation/act-2",
  "defend-installation/act-1",
  "evacuation/act-2",
  "infestation-clearance/act-2",
];

/** One queued run: what to play and where its result goes. */
export interface MatrixRun extends RunSpec {
  /** Position in the queue; the result and claim files are named by it. */
  readonly index: number;
}

/**
 * Every run of the cells `filters` select (all of them when none),
 * heaviest cells first, then cell order, seed, player. A run keeps its
 * cell's index in `CALIBRATION_CELLS`, so a filtered run plays exactly
 * the mission, force and dice the full matrix plays for that cell.
 */
export function matrixRuns(
  seeds: number = MATRIX_SEEDS,
  filters: readonly string[] = MATRIX_CELL_FILTERS,
): readonly MatrixRun[] {
  const order = [...selectCells(filters)].sort(
    (a, b) =>
      weight(a.cell.id) - weight(b.cell.id) || a.cellIndex - b.cellIndex,
  );
  const specs: RunSpec[] = [];
  for (const { cell, cellIndex } of order) {
    for (let seedIndex = 0; seedIndex < seeds; seedIndex++) {
      for (const player of PLAYER_IDS) {
        specs.push({ cellIndex, seedIndex, player, luck: player });
      }
      if (cell.id === GAP_CELL_ID) {
        specs.push({ cellIndex, seedIndex, player: "expert", luck: "new" });
      }
    }
  }
  return specs.map((spec, index) => ({ ...spec, index }));
}

/** Where a matrix run's claims and results live. */
export interface MatrixScratch {
  readonly claims: string;
  readonly results: string;
}

/** The scratch directories for `out` under `token`, created. */
export function matrixScratch(out: string, token: string): MatrixScratch {
  const root = `${out}.parts/${token}`;
  const claims = `${root}/claims`;
  const results = `${root}/results`;
  mkdirSync(claims, { recursive: true });
  mkdirSync(results, { recursive: true });
  return { claims, results };
}

/**
 * Plays every run of `runs` no other shard has claimed, writing each
 * result as it lands. Returns how many this shard played. `play` is
 * the calibration run unless a test hands in its own.
 */
export function playShare(
  runs: readonly MatrixRun[],
  scratch: MatrixScratch,
  play: (spec: RunSpec) => RunResult = playRun,
): number {
  let played = 0;
  for (const run of runs) {
    if (!claim(`${scratch.claims}/${String(run.index)}`)) continue;
    const result = play(run);
    writeFileSync(
      `${scratch.results}/${String(run.index)}.json`,
      JSON.stringify(result),
    );
    played += 1;
  }
  return played;
}

/** Every result in, or undefined while a run is still being played. */
export function collectResults(
  runs: readonly MatrixRun[],
  scratch: MatrixScratch,
): readonly RunResult[] | undefined {
  const present = new Set(readdirSync(scratch.results));
  if (runs.some((run) => !present.has(`${String(run.index)}.json`)))
    return undefined;
  return runs.map(
    (run) =>
      JSON.parse(
        readFileSync(`${scratch.results}/${String(run.index)}.json`, "utf8"),
      ) as RunResult,
  );
}

// ===========================================
// A shard
// ===========================================

/** Where the matrix TSV goes; unset, the matrix does not run. */
const OUT = process.env.SIM_MATRIX_OUT;

/** Wall-clock budget of one shard: the whole matrix, if it is alone. */
const SHARD_TIMEOUT_MS = 6 * 3_600_000;

/**
 * Registers one shard of the matrix: it plays whatever runs are left
 * unclaimed, and if it writes the last result it merges them, writes
 * the TSVs and holds the structural pins:
 *
 *   every run ends with an outcome (the turn cap abandons the rest)
 *   the expert wins at least as often as the new player, per band, and
 *   per cell with the one-seed allowance
 *
 * Then the arc's targets (`calibration-targets.test-helper`), skipped
 * while `TARGETED_CELLS` is empty: the expert's in every targeted cell,
 * the new player's in every band whose cells are all targeted. Only the
 * shard that merged has rows to assert; the others pass them by.
 *
 * Runs only when `SIM_MATRIX_OUT` is set: the matrix is a measurement
 * that takes most of an hour, not part of the everyday sim suite.
 */
export function defineMatrixShard(shard: string): void {
  describe.skipIf(OUT === undefined)(
    `the calibration matrix, shard ${shard}`,
    () => {
      /** The matrix's rows, once this shard has merged them. */
      let merged: readonly CellSummary[] | undefined;
      it(
        "plays its share of the runs; the last shard in pins the matrix",
        () => {
          const out = OUT ?? "";
          const runs = matrixRuns();
          const scratch = matrixScratch(
            out,
            process.env.SIM_MATRIX_TOKEN ?? String(process.ppid),
          );
          playShare(runs, scratch);
          const results = collectResults(runs, scratch);
          if (results === undefined) return;
          const rows = summarise(results);
          merged = rows;
          const cells = cellPins(rows);
          const bands = bandPins(rows);
          const targets = expertTargetPins(rows);
          const standing = newPlayerBandPins(rows);
          writeFileSync(out, matrixTsv(rows, cells, targets));
          writeFileSync(runsPath(out), runsTsv(results));
          writeFileSync(bandsPath(out), bandsTsv(standing, bands, targets));
          for (const note of pinNotes(cells, bands)) {
            console.log(`calibration pin ${note}`);
          }
          for (const note of targetNotes(standing, targets)) {
            console.log(`calibration target ${note}`);
          }
          for (const result of results) {
            expect(["won", "extracted", "lost"]).toContain(result.outcome);
          }
          for (const pin of bands) {
            expect(pin.holds, `band ${pin.band}`).toBe(true);
          }
          for (const pin of cells) {
            expect(pin.verdict, pin.cell).not.toBe("fail");
          }
        },
        SHARD_TIMEOUT_MS,
      );
      it.skipIf(TARGETED_CELLS.length === 0)(
        `the expert wins at least ${String(EXPERT_CELL_TARGET)}% in every targeted cell`,
        () => {
          for (const pin of targetedExpertPins(merged ?? [])) {
            expect(
              pin.verdict,
              `${pin.cell}: ${String(pin.won)}/${String(pin.runs)}, needs ${String(pin.needed)}`,
            ).not.toBe("short");
          }
        },
      );
      it.skipIf(TARGETED_CELLS.length === 0)(
        "the new player hits its band's target in every targeted band",
        () => {
          for (const pin of targetedBandPins(merged ?? [])) {
            expect(
              pin.verdict,
              `${pin.band}: ${pin.winRate.toFixed(1)}% against ${String(pin.target)} ± ${pin.tolerance.toFixed(1)}`,
            ).toBe("on");
          }
        },
      );
    },
  );
}

// ===========================================
// Summaries
// ===========================================

/** One cell × player (× luck) row of the matrix. */
export interface CellSummary {
  readonly cell: string;
  readonly band: ForceBand;
  readonly player: PlayerId;
  readonly luck: PlayerId;
  readonly runs: number;
  readonly won: number;
  readonly extracted: number;
  readonly lost: number;
  /** Runs abandoned at the turn cap. */
  readonly capped: number;
  /** Runs abandoned with the job done and the rest boxed in. */
  readonly stalled: number;
  /** Wins over runs, percent. */
  readonly winRate: number;
  /** The new player's target for the band, percent: met on the band's pooled wins, not the cell's. */
  readonly newBandTarget: number;
  /** The expert's target in every cell, percent. */
  readonly expertTarget: number;
  readonly unitsLost: number;
  readonly mechsLost: number;
  readonly turns: number;
  readonly bugPhaseMs: number;
  readonly hitRate: number;
  readonly wallSeconds: number;
}

/** The rows of the matrix, in cell order: new, expert, then the gap row. */
export function summarise(
  results: readonly RunResult[],
): readonly CellSummary[] {
  const rows: CellSummary[] = [];
  for (const cell of CALIBRATION_CELLS) {
    const lines: [PlayerId, PlayerId][] = [
      ["new", "new"],
      ["expert", "expert"],
      ["expert", "new"],
    ];
    for (const [player, luck] of lines) {
      const mine = results.filter(
        (r) => r.cell === cell.id && r.player === player && r.luck === luck,
      );
      if (mine.length === 0) continue;
      const count = (outcome: string): number =>
        mine.filter((r) => r.outcome === outcome).length;
      const shots = mine.reduce((sum, r) => sum + r.shots, 0);
      const hits = mine.reduce((sum, r) => sum + r.hits, 0);
      rows.push({
        cell: cell.id,
        band: cell.band,
        player,
        luck,
        runs: mine.length,
        won: count("won"),
        extracted: count("extracted"),
        lost: count("lost"),
        capped: mine.filter((r) => r.abandoned === "cap").length,
        stalled: mine.filter((r) => r.abandoned === "stall").length,
        winRate: (100 * count("won")) / mine.length,
        newBandTarget: NEW_PLAYER_BAND_TARGETS[cell.band],
        expertTarget: EXPERT_CELL_TARGET,
        unitsLost: mean(mine.map((r) => r.unitsLost)),
        mechsLost: mean(mine.map((r) => r.mechsLost)),
        turns: medianOf(mine.map((r) => r.turns)),
        bugPhaseMs: medianOf(mine.map((r) => r.bugPhaseMs)),
        hitRate: shots === 0 ? 0 : (100 * hits) / shots,
        wallSeconds: mine.reduce((sum, r) => sum + r.wallMs, 0) / 1000,
      });
    }
  }
  return rows;
}

/**
 * The matrix as a TSV: one row per cell × player (× luck). Every row
 * names both targets: the new player's band target, met on the band's
 * pooled wins, and the expert's cell target. The expert's own row
 * carries its cell's expert-over-new verdict (`pins`) and its target
 * verdict (`targets`); the others leave them empty.
 */
export function matrixTsv(
  rows: readonly CellSummary[],
  pins: readonly CellPin[] = [],
  targets: readonly ExpertTargetPin[] = [],
): string {
  const header = [
    "cell",
    "band",
    "player",
    "luck",
    "runs",
    "won",
    "extracted",
    "lost",
    "capped",
    "stalled",
    "win_pct",
    "new_band_target_pct",
    "expert_cell_target_pct",
    "units_lost_mean",
    "mechs_lost_mean",
    "turns_median",
    "bug_phase_ms_median",
    "hit_pct",
    "wall_s",
    "pin",
    "expert_target",
  ];
  const lines = rows.map((row) =>
    [
      row.cell,
      row.band,
      row.player,
      row.luck,
      row.runs,
      row.won,
      row.extracted,
      row.lost,
      row.capped,
      row.stalled,
      row.winRate.toFixed(0),
      row.newBandTarget,
      row.expertTarget,
      row.unitsLost.toFixed(2),
      row.mechsLost.toFixed(2),
      row.turns,
      row.bugPhaseMs.toFixed(0),
      row.hitRate.toFixed(0),
      row.wallSeconds.toFixed(0),
      ownExpert(row)
        ? (pins.find((pin) => pin.cell === row.cell)?.verdict ?? "")
        : "",
      ownExpert(row)
        ? (targets.find((pin) => pin.cell === row.cell)?.verdict ?? "")
        : "",
    ].join("\t"),
  );
  return [header.join("\t"), ...lines].join("\n") + "\n";
}

/** Where the per-run TSV goes beside the matrix at `out`: `x.tsv` → `x.runs.tsv`. */
export function runsPath(out: string): string {
  return `${out.replace(/\.tsv$/, "")}.runs.tsv`;
}

/** Where the per-band TSV goes beside the matrix at `out`: `x.tsv` → `x.bands.tsv`. */
export function bandsPath(out: string): string {
  return `${out.replace(/\.tsv$/, "")}.bands.tsv`;
}

/**
 * One row per band: the new player's pooled wins against its band
 * target and tolerance, and the expert's pooled wins, how many of its
 * cells met their target, and whether it beat the new player over the
 * band (the structural band pin).
 */
export function bandsTsv(
  standing: readonly NewPlayerBandPin[],
  bands: readonly BandPin[],
  targets: readonly ExpertTargetPin[],
): string {
  const header = [
    "band",
    "new_won",
    "new_runs",
    "new_win_pct",
    "new_target_pct",
    "new_tolerance_pct",
    "new_target",
    "expert_won",
    "expert_runs",
    "expert_win_pct",
    "expert_cells_met",
    "expert_cells",
    "expert_over_new",
  ];
  const lines = standing.map((pin) => {
    const band = bands.find((b) => b.band === pin.band);
    const cells = targets.filter((t) => t.band === pin.band);
    const expertRuns = band?.expertRuns ?? 0;
    return [
      pin.band,
      pin.won,
      pin.runs,
      pin.winRate.toFixed(1),
      pin.target,
      pin.tolerance.toFixed(1),
      pin.verdict,
      band?.expertWon ?? 0,
      expertRuns,
      expertRuns === 0
        ? "0.0"
        : ((100 * (band?.expertWon ?? 0)) / expertRuns).toFixed(1),
      cells.filter((t) => t.verdict === "met").length,
      cells.length,
      band === undefined ? "" : band.holds ? "holds" : "fail",
    ].join("\t");
  });
  return [header.join("\t"), ...lines].join("\n") + "\n";
}

/** Every run as a TSV row, for the evidence behind a cell. */
export function runsTsv(results: readonly RunResult[]): string {
  const header = [
    "cell",
    "seed",
    "player",
    "luck",
    "difficulty",
    "outcome",
    "abandoned",
    "turns",
    "units_lost",
    "mechs_lost",
    "deployed",
    "bug_phase_ms",
    "shots",
    "hits",
    "commands",
    "refused",
    "wall_s",
  ];
  const lines = results.map((r) =>
    [
      r.cell,
      r.seedIndex,
      r.player,
      r.luck,
      r.difficulty,
      r.outcome,
      r.abandoned,
      r.turns,
      r.unitsLost,
      r.mechsLost,
      r.deployed,
      r.bugPhaseMs.toFixed(0),
      r.shots,
      r.hits,
      r.commands,
      r.refused,
      (r.wallMs / 1000).toFixed(1),
    ].join("\t"),
  );
  return [header.join("\t"), ...lines].join("\n") + "\n";
}

// ===========================================
// Private
// ===========================================

/** Whether `row` is the expert playing on its own dice: the row the pins and targets are read from. */
function ownExpert(row: CellSummary): boolean {
  return row.player === "expert" && row.luck === "expert";
}

/** Queue weight of a cell: its place in `HEAVY_FIRST`, or after them all. */
function weight(cellId: string): number {
  const at = HEAVY_FIRST.indexOf(cellId);
  return at < 0 ? HEAVY_FIRST.length : at;
}

/** Claims `path` for this shard: true when this shard created it. */
function claim(path: string): boolean {
  if (existsSync(path)) return false;
  try {
    closeSync(openSync(path, "wx"));
    return true;
  } catch {
    return false;
  }
}

/** The mean of `values`; 0 for none. */
function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((a, b) => a + b, 0) / values.length;
}

/** The median of `values`; 0 for none. */
function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

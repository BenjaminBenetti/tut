import type { CalibrationCell } from "./calibration-cells.test-helper";
import { CALIBRATION_CELLS } from "./calibration-cells.test-helper";
import type { ForceBand } from "./calibration-forces.test-helper";
import type { CellSummary } from "./calibration-matrix.test-helper";

// ===========================================
// The arc's targets (#1179, campaign arc D5 and §12)
// ===========================================
//
// Two players, two targets, measured two different ways:
//
//   new player   hits the band's target: 90 / 75 / 65 / 55 by act band,
//                on the band's wins pooled over every run of every cell,
//                within ± BAND_TOLERANCE_SIGMAS binomial standard deviations
//   expert       wins at least EXPERT_CELL_TARGET (90%) in every cell,
//                one seed of allowance (EXPERT_TARGET_ALLOWANCE)
//
// The new player's target is two-sided: a band far above its target is
// a band that is too easy, which the arc's rising curve rules out as
// firmly as one that is too hard. The expert's is a floor.

/** The new player's win-rate target per act band, in percent: the band's pooled wins over runs (arc D5). */
export const NEW_PLAYER_BAND_TARGETS: Readonly<Record<ForceBand, number>> = {
  "act-1": 90,
  "act-2": 75,
  "act-3": 65,
  finale: 55,
};

/** The expert's win-rate floor in every cell, in percent (arc D5: "every act easy, ≥ 90%"). */
export const EXPERT_CELL_TARGET = 90;

/**
 * How many binomial standard deviations either side of its target a
 * band's pooled new-player rate may sit. Two: a band exactly on target
 * lands inside on about 95% of seed sets. The runs of a band are not
 * one coin: its cells differ, and mixing coins of different bias gives
 * less variance than one coin at the mean, so the binomial deviation at
 * the target is an upper bound and the band is inside more often still.
 */
export const BAND_TOLERANCE_SIGMAS = 2;

/**
 * Seeds a cell's expert may fall short of the wins its target asks for
 * and still pass, marked `allowance` so the cell stays in sight. At 16
 * seeds the target asks for 15; a cell whose expert truly wins 90%
 * reaches 15 only about half the time (51%), and 14 about 79% of the
 * time; one that truly wins 95% reaches 14 about 96% of the time.
 */
export const EXPERT_TARGET_ALLOWANCE = 1;

/**
 * The cells whose targets are asserted, as `SIM_MATRIX_CELLS` filters
 * (a cell id, or a prefix of one). Empty at the baseline, where the
 * targets were measured and reported, not asserted. A tuning package
 * adds its own cells' filters when its tuning lands, which unskips the
 * expert's assertion on them; a band's new-player assertion runs once
 * every cell of the band is listed.
 *
 * ```
 *   hive-assault                  both Hive Assault cells (#1179 C3a, round 2)
 *   infestation-clearance/act-2   (#1179 C2b-1-field)
 *   crash-site/act-3              (#1179 C2b-1-field)
 *   evacuation/act-1…3            the three Evacuation cells (#1179 C2b-1-field)
 *   story:live-specimen/act-1     Live Specimen (#1179 C3b, phase 3)
 *   story:intact-pod/act-2        Intact Pod (#1179 C3b)
 *   alpha-hunt                    both Alpha Hunt cells (#1179 C3b)
 *   story:spore-platform/finale   the Spore Platform (#1179 C3b)
 *   defend-installation/act-1…3   the three defences (#1179 C2b-2)
 *   story:uplink/act-3            Uplink (#1179 C2b-2)
 *   story:launch-window/finale    Launch Window (#1179 C2b-2)
 *   tunnel-sabotage/act-2         act 2 only: act 3's new player wins every seed (#1179 C2b-2)
 *   wreck-recovery/act-2, act-3   both Wreck Recovery cells (#1179 C2b-2)
 * ```
 *
 * Each package's cells are tuned in its own page under
 * `docs/design/calibration/`: `C2b-1-field.md`, `C2b-2-defence.md`,
 * `C3a-hives.md` and `C3b-story.md`.
 */
export const TARGETED_CELLS: readonly string[] = [
  "hive-assault",
  "infestation-clearance/act-2",
  "crash-site/act-3",
  "evacuation/act-1",
  "evacuation/act-2",
  "evacuation/act-3",
  "story:live-specimen/act-1",
  "story:intact-pod/act-2",
  "alpha-hunt",
  "story:spore-platform/finale",
  "defend-installation/act-1",
  "defend-installation/act-2",
  "defend-installation/act-3",
  "story:uplink/act-3",
  "story:launch-window/finale",
  "tunnel-sabotage/act-2",
  "wreck-recovery/act-2",
  "wreck-recovery/act-3",
];

// ===========================================
// Types
// ===========================================

/** How a cell's expert met its target: at or over it, inside the allowance, or short. */
export type ExpertTargetVerdict = "met" | "allowance" | "short";

/** One cell's expert against `EXPERT_CELL_TARGET`. */
export interface ExpertTargetPin {
  readonly cell: string;
  readonly band: ForceBand;
  readonly won: number;
  readonly runs: number;
  /** The wins the target asks for: ⌈90% × runs⌉. */
  readonly needed: number;
  readonly verdict: ExpertTargetVerdict;
}

/** Where a band's new player sits against its target: inside the tolerance, below it, or above it. */
export type BandTargetVerdict = "on" | "low" | "high";

/** One band's new player against `NEW_PLAYER_BAND_TARGETS`. */
export interface NewPlayerBandPin {
  readonly band: ForceBand;
  readonly won: number;
  readonly runs: number;
  /** Pooled wins over runs, percent. */
  readonly winRate: number;
  /** The band's target, percent. */
  readonly target: number;
  /** Percentage points either side of the target that count as on it. */
  readonly tolerance: number;
  readonly verdict: BandTargetVerdict;
}

// ===========================================
// Targets
// ===========================================

/** The wins an expert needs over `runs` to meet `EXPERT_CELL_TARGET`: ⌈target × runs⌉, in whole-number arithmetic. */
export function expertWinsNeeded(runs: number): number {
  return Math.ceil((EXPERT_CELL_TARGET * runs) / 100);
}

/**
 * The tolerance, in percentage points, of a band whose target is
 * `target` percent over `runs` pooled runs:
 *
 * ```
 *   tolerance = BAND_TOLERANCE_SIGMAS × 100 × √(p (1 − p) / runs),   p = target / 100
 * ```
 */
export function bandTolerance(target: number, runs: number): number {
  if (runs <= 0) return 100;
  const p = target / 100;
  return BAND_TOLERANCE_SIGMAS * 100 * Math.sqrt((p * (1 - p)) / runs);
}

/**
 * Each cell's expert against its target, in the rows' order. Reads the
 * expert's own luck; the decision-gap row is not a target row.
 */
export function expertTargetPins(
  rows: readonly CellSummary[],
): readonly ExpertTargetPin[] {
  return rows
    .filter((row) => row.player === "expert" && row.luck === "expert")
    .map((row) => {
      const needed = expertWinsNeeded(row.runs);
      const verdict: ExpertTargetVerdict =
        row.won >= needed
          ? "met"
          : row.won >= needed - EXPERT_TARGET_ALLOWANCE
            ? "allowance"
            : "short";
      return {
        cell: row.cell,
        band: row.band,
        won: row.won,
        runs: row.runs,
        needed,
        verdict,
      };
    });
}

/**
 * Each band's new player against its target, in the order the bands
 * first appear: the wins of every new-player row of the band, pooled.
 */
export function newPlayerBandPins(
  rows: readonly CellSummary[],
): readonly NewPlayerBandPin[] {
  const own = rows.filter((row) => row.player === "new" && row.luck === "new");
  const bands = [...new Set(own.map((row) => row.band))];
  return bands.map((band) => {
    const mine = own.filter((row) => row.band === band);
    const won = mine.reduce((total, row) => total + row.won, 0);
    const runs = mine.reduce((total, row) => total + row.runs, 0);
    const target = NEW_PLAYER_BAND_TARGETS[band];
    const tolerance = bandTolerance(target, runs);
    const winRate = runs === 0 ? 0 : (100 * won) / runs;
    const verdict: BandTargetVerdict =
      winRate < target - tolerance
        ? "low"
        : winRate > target + tolerance
          ? "high"
          : "on";
    return { band, won, runs, winRate, target, tolerance, verdict };
  });
}

// ===========================================
// Targeted cells
// ===========================================

/** Whether `targeted` (see `TARGETED_CELLS`) names the cell `cellId`; an empty list names none. */
export function isTargeted(
  cellId: string,
  targeted: readonly string[] = TARGETED_CELLS,
): boolean {
  return targeted.some((entry) => cellId.startsWith(entry));
}

/** The expert target pins of the targeted cells among `rows`: the ones the matrix asserts. */
export function targetedExpertPins(
  rows: readonly CellSummary[],
  targeted: readonly string[] = TARGETED_CELLS,
): readonly ExpertTargetPin[] {
  return expertTargetPins(rows).filter((pin) => isTargeted(pin.cell, targeted));
}

/**
 * The new player's band pins the matrix asserts: a band's, once every
 * cell of it in `cells` is targeted and every one of them was played in
 * this run. A band some of whose cells are still untuned, or were left
 * out by `SIM_MATRIX_CELLS`, is reported but not asserted.
 */
export function targetedBandPins(
  rows: readonly CellSummary[],
  targeted: readonly string[] = TARGETED_CELLS,
  cells: readonly CalibrationCell[] = CALIBRATION_CELLS,
): readonly NewPlayerBandPin[] {
  const played = new Set(
    rows.filter((row) => row.player === "new").map((row) => row.cell),
  );
  return newPlayerBandPins(rows).filter((pin) =>
    cells
      .filter((cell) => cell.band === pin.band)
      .every((cell) => isTargeted(cell.id, targeted) && played.has(cell.id)),
  );
}

/** A line per band and per cell short of or inside the allowance of its target, for the run's log. */
export function targetNotes(
  bands: readonly NewPlayerBandPin[],
  cells: readonly ExpertTargetPin[],
): readonly string[] {
  return [
    ...bands.map(
      (pin) =>
        `new ${pin.band}: ${String(pin.won)}/${String(pin.runs)} = ${pin.winRate.toFixed(1)}% ` +
        `against ${String(pin.target)} ± ${pin.tolerance.toFixed(1)}: ${pin.verdict}`,
    ),
    ...cells
      .filter((pin) => pin.verdict !== "met")
      .map(
        (pin) =>
          `expert ${pin.cell}: ${String(pin.won)}/${String(pin.runs)} against ${String(pin.needed)}: ${pin.verdict}`,
      ),
  ];
}

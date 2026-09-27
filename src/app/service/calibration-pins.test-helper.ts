import type { ForceBand } from "./calibration-forces.test-helper";
import type { CellSummary } from "./calibration-matrix.test-helper";

// ===========================================
// The matrix's structural pins (#1179, campaign arc §12)
// ===========================================
//
// The matrix pins only what must hold whatever the tuning: the expert
// plays at least as well as the new player. Pinned cell by cell at 8
// seeds, that pin goes red on noise, and a pin that goes red on noise
// teaches people to ignore it. So it is pinned twice:
//
//   per band   expert wins / runs  ≥  new wins / runs      (no allowance)
//   per cell   expert wins         ≥  new wins − PIN_SEED_ALLOWANCE
//
// A cell that needs the allowance is named in the matrix's `pin`
// column, so a real weakness hiding inside it stays in sight.

/**
 * Seeds a cell's expert may win fewer than its new player and still
 * pass. One seed is binomial noise: a cell both players win half the
 * time has a standard deviation of √(8 × ½ × ½) ≈ 1.4 wins at 8 seeds
 * and √(16 × ½ × ½) = 2 at the default 16, so either player can land a
 * seed ahead on the dice alone.
 */
export const PIN_SEED_ALLOWANCE = 1;

/** How a cell met the expert-over-new pin. */
export type PinVerdict = "clear" | "allowance" | "fail";

/** One cell's expert-over-new pin. */
export interface CellPin {
  readonly cell: string;
  readonly band: ForceBand;
  readonly expertWon: number;
  readonly newWon: number;
  readonly runs: number;
  readonly verdict: PinVerdict;
}

/** One band's expert-over-new pin, over every cell in the band. */
export interface BandPin {
  readonly band: ForceBand;
  readonly expertWon: number;
  readonly expertRuns: number;
  readonly newWon: number;
  readonly newRuns: number;
  readonly holds: boolean;
}

/**
 * Each cell's pin, in the rows' order: clear when the expert won at
 * least as many seeds, allowance when it won at most
 * `PIN_SEED_ALLOWANCE` fewer, fail otherwise. Reads each player's own
 * luck; the decision-gap row is not pinned.
 */
export function cellPins(rows: readonly CellSummary[]): readonly CellPin[] {
  const pins: CellPin[] = [];
  for (const expert of rows) {
    if (expert.player !== "expert" || expert.luck !== "expert") continue;
    const rookie = rows.find(
      (row) =>
        row.cell === expert.cell && row.player === "new" && row.luck === "new",
    );
    if (rookie === undefined) continue;
    const verdict: PinVerdict =
      expert.won >= rookie.won
        ? "clear"
        : expert.won >= rookie.won - PIN_SEED_ALLOWANCE
          ? "allowance"
          : "fail";
    pins.push({
      cell: expert.cell,
      band: expert.band,
      expertWon: expert.won,
      newWon: rookie.won,
      runs: expert.runs,
      verdict,
    });
  }
  return pins;
}

/**
 * Each band's pin, in the order the bands first appear: the expert's
 * wins over its runs at least the new player's, across every cell of
 * the band, with no allowance.
 */
export function bandPins(rows: readonly CellSummary[]): readonly BandPin[] {
  const bands = [...new Set(rows.map((row) => row.band))];
  return bands.map((band) => {
    const own = (player: "new" | "expert"): readonly CellSummary[] =>
      rows.filter(
        (row) =>
          row.band === band && row.player === player && row.luck === player,
      );
    const expertWon = sum(own("expert").map((row) => row.won));
    const expertRuns = sum(own("expert").map((row) => row.runs));
    const newWon = sum(own("new").map((row) => row.won));
    const newRuns = sum(own("new").map((row) => row.runs));
    return {
      band,
      expertWon,
      expertRuns,
      newWon,
      newRuns,
      // Cross-multiplied so equal rates compare equal without rounding.
      holds: expertWon * newRuns >= newWon * expertRuns,
    };
  });
}

/** A line per cell that needed the allowance or failed, and per band that failed. */
export function pinNotes(
  cells: readonly CellPin[],
  bands: readonly BandPin[],
): readonly string[] {
  return [
    ...cells
      .filter((pin) => pin.verdict !== "clear")
      .map(
        (pin) =>
          `${pin.verdict}: ${pin.cell} expert ${String(pin.expertWon)}/${String(pin.runs)}, new ${String(pin.newWon)}/${String(pin.runs)}`,
      ),
    ...bands
      .filter((pin) => !pin.holds)
      .map(
        (pin) =>
          `fail: band ${pin.band} expert ${String(pin.expertWon)}/${String(pin.expertRuns)}, new ${String(pin.newWon)}/${String(pin.newRuns)}`,
      ),
  ];
}

// ===========================================
// Private
// ===========================================

/** The sum of `values`. */
function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

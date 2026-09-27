import { describe, expect, it } from "vitest";

import type { ForceBand } from "./calibration-forces.test-helper";
import type { CellSummary } from "./calibration-matrix.test-helper";
import {
  bandPins,
  cellPins,
  PIN_SEED_ALLOWANCE,
  pinNotes,
} from "./calibration-pins.test-helper";
import type { PlayerId } from "./calibration-run.test-helper";

/** A matrix row with `won` of 8 seeds and nothing else measured. */
function row(
  cell: string,
  band: ForceBand,
  player: PlayerId,
  won: number,
  luck: PlayerId = player,
): CellSummary {
  return {
    cell,
    band,
    player,
    luck,
    runs: 8,
    won,
    extracted: 0,
    lost: 8 - won,
    capped: 0,
    stalled: 0,
    winRate: (100 * won) / 8,
    target: 90,
    unitsLost: 0,
    mechsLost: 0,
    turns: 0,
    bugPhaseMs: 0,
    hitRate: 0,
    wallSeconds: 0,
  };
}

/** Three Act I cells: one clear, one inside the allowance, one past it. */
const ACT_ONE: readonly CellSummary[] = [
  row("even", "act-1", "new", 5),
  row("even", "act-1", "expert", 5),
  row("even", "act-1", "expert", 1, "new"),
  row("close", "act-1", "new", 5),
  row("close", "act-1", "expert", 5 - PIN_SEED_ALLOWANCE),
  row("behind", "act-1", "new", 6),
  row("behind", "act-1", "expert", 6 - PIN_SEED_ALLOWANCE - 1),
];

describe("the matrix's pins", () => {
  it("allow a cell's expert one seed behind, and no more", () => {
    expect(PIN_SEED_ALLOWANCE).toBe(1);
    expect(cellPins(ACT_ONE).map((pin) => [pin.cell, pin.verdict])).toEqual([
      ["even", "clear"],
      ["close", "allowance"],
      ["behind", "fail"],
    ]);
  });

  it("hold a band on its aggregate, with no allowance", () => {
    const rows = [
      ...ACT_ONE,
      row("ahead", "act-2", "new", 2),
      row("ahead", "act-2", "expert", 6),
      row("short", "act-2", "new", 5),
      row("short", "act-2", "expert", 4),
    ];
    expect(bandPins(rows)).toEqual([
      {
        band: "act-1",
        expertWon: 13,
        expertRuns: 24,
        newWon: 16,
        newRuns: 24,
        holds: false,
      },
      {
        band: "act-2",
        expertWon: 10,
        expertRuns: 16,
        newWon: 7,
        newRuns: 16,
        holds: true,
      },
    ]);
  });

  it("name every cell that used the allowance or failed, and every failing band", () => {
    const notes = pinNotes(cellPins(ACT_ONE), bandPins(ACT_ONE));
    expect(notes).toEqual([
      "allowance: close expert 4/8, new 5/8",
      "fail: behind expert 4/8, new 6/8",
      "fail: band act-1 expert 13/24, new 16/24",
    ]);
  });
});

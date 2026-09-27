/// <reference types="node" />
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CALIBRATION_CELLS,
  CALIBRATION_TARGETS,
} from "./calibration-cells.test-helper";
import { defineMatrixShard } from "./calibration-matrix.test-helper";

// ===========================================
// The calibration matrix (#1179, campaign arc §12)
// ===========================================

/**
 * Every mission type and story mission in every act band the arc
 * offers it in, played by the new and the expert modelled player over
 * `SIM_MATRIX_SEEDS` seeds (8 by default), plus the decision-gap cell:
 * the expert on the new player's dice. The runs are shared among this
 * file and `calibration-matrix-shard-{2..8}.sim.test.ts`, which vitest
 * runs side by side; whichever finishes the last run writes the TSV to
 * `SIM_MATRIX_OUT` and holds the structural pins.
 *
 * ```
 *   SIM_MATRIX_OUT=docs/design/calibration/baseline-matrix.tsv \
 *     vitest run --config vitest.sim.config.ts --maxWorkers=8 calibration-matrix
 * ```
 */
defineMatrixShard("1");

/** Where the matrix TSV was written. */
const OUT = process.env.SIM_MATRIX_OUT;

describe("the calibration targets (campaign arc §12)", () => {
  // Skipped until tuning lands: the baseline measures today's game, and
  // the expert falls short of the targets in the cells the report names.
  it.skip("the expert meets its band's target in every cell", () => {
    const [header = [], ...rows] = readFileSync(OUT ?? "", "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split("\t"));
    const column = (name: string): number => header.indexOf(name);
    for (const cell of CALIBRATION_CELLS) {
      const expert = rows.find(
        (row) =>
          row[column("cell")] === cell.id &&
          row[column("player")] === "expert" &&
          row[column("luck")] === "expert",
      );
      expect(
        Number(expert?.[column("win_pct")]),
        cell.id,
      ).toBeGreaterThanOrEqual(CALIBRATION_TARGETS[cell.band]);
    }
  });
});

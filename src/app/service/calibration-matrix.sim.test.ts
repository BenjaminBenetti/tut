import { defineMatrixShard } from "./calibration-matrix.test-helper";

// ===========================================
// The calibration matrix (#1179, campaign arc §12)
// ===========================================

/**
 * Every mission type and story mission in every act band the arc
 * offers it in, played by the new and the expert modelled player over
 * `SIM_MATRIX_SEEDS` seeds (16 by default), plus the decision-gap cell:
 * the expert on the new player's dice. `SIM_MATRIX_CELLS` plays only
 * the cells it names (ids or prefixes, comma-separated). The runs are
 * shared among this file and `calibration-matrix-shard-{2..8}.sim.test.ts`,
 * which vitest runs side by side; whichever finishes the last run
 * writes the TSV to `SIM_MATRIX_OUT`, holds the structural pins and,
 * for the cells `TARGETED_CELLS` names, the arc's targets.
 *
 * ```
 *   SIM_MATRIX_OUT=docs/design/calibration/baseline-matrix.tsv \
 *     vitest run --config vitest.sim.config.ts --maxWorkers=8 calibration-matrix
 * ```
 */
defineMatrixShard("1");

import { describe, expect, it } from "vitest";

import {
  CALIBRATION_CELLS,
  cellMatches,
  parseCellFilters,
  selectCells,
} from "./calibration-cells.test-helper";

describe("the matrix's cell filter (SIM_MATRIX_CELLS)", () => {
  it("reads a comma-separated list, trimmed, blanks dropped; unset or empty is no filter", () => {
    expect(
      parseCellFilters(" hive-assault , story:great-hive/act-3,,"),
    ).toEqual(["hive-assault", "story:great-hive/act-3"]);
    expect(parseCellFilters(undefined)).toEqual([]);
    expect(parseCellFilters("")).toEqual([]);
  });

  it("selects a cell by its id or a prefix of it, and every cell with no filter", () => {
    expect(cellMatches([], "crash-site/act-1")).toBe(true);
    expect(cellMatches(["crash-site"], "crash-site/act-1")).toBe(true);
    expect(cellMatches(["crash-site/act-2"], "crash-site/act-1")).toBe(false);
    expect(cellMatches(["act-1"], "crash-site/act-1")).toBe(false);
  });

  it("keeps each selected cell's index in the full list, in list order", () => {
    const selected = selectCells(["story:great-hive/act-3", "hive-assault"]);
    expect(selected.map(({ cell }) => cell.id)).toEqual([
      "hive-assault/act-2",
      "hive-assault/act-3",
      "story:great-hive/act-3",
    ]);
    for (const { cell, cellIndex } of selected) {
      expect(CALIBRATION_CELLS[cellIndex]).toBe(cell);
    }
    expect(selectCells([])).toHaveLength(CALIBRATION_CELLS.length);
    expect(
      selectCells(["story:"]).every(({ cell }) => cell.id.startsWith("story:")),
    ).toBe(true);
  });

  it("refuses an entry that selects no cell, rather than playing nothing", () => {
    expect(() => selectCells(["hive-asault"])).toThrow(/hive-asault/);
  });
});

import { describe, expect, it } from "vitest";

import type { CalibrationCell } from "./calibration-cells.test-helper";
import { CALIBRATION_CELLS } from "./calibration-cells.test-helper";
import type { ForceBand } from "./calibration-forces.test-helper";
import type { CellSummary } from "./calibration-matrix.test-helper";
import type { PlayerId } from "./calibration-run.test-helper";
import {
  bandTolerance,
  EXPERT_CELL_TARGET,
  EXPERT_TARGET_ALLOWANCE,
  expertTargetPins,
  expertWinsNeeded,
  isTargeted,
  NEW_PLAYER_BAND_TARGETS,
  newPlayerBandPins,
  TARGETED_CELLS,
  targetedBandPins,
  targetedExpertPins,
  targetNotes,
} from "./calibration-targets.test-helper";

/** A matrix row with `won` of `runs` and nothing else measured. */
function row(
  cell: string,
  band: ForceBand,
  player: PlayerId,
  won: number,
  runs = 16,
  luck: PlayerId = player,
): CellSummary {
  return {
    cell,
    band,
    player,
    luck,
    runs,
    won,
    extracted: 0,
    lost: runs - won,
    capped: 0,
    stalled: 0,
    winRate: (100 * won) / runs,
    newBandTarget: NEW_PLAYER_BAND_TARGETS[band],
    expertTarget: EXPERT_CELL_TARGET,
    unitsLost: 0,
    mechsLost: 0,
    turns: 0,
    bugPhaseMs: 0,
    hitRate: 0,
    wallSeconds: 0,
  };
}

/** A two-cell stand-in for the matrix: one Act I cell, one Act II. */
const CELLS = [
  { id: "a/act-1", band: "act-1" },
  { id: "b/act-2", band: "act-2" },
  { id: "c/act-2", band: "act-2" },
] as unknown as readonly CalibrationCell[];

describe("the arc's targets", () => {
  it("aim the new player at 90/75/65/55 by band and the expert at 90% in every cell", () => {
    expect(NEW_PLAYER_BAND_TARGETS).toEqual({
      "act-1": 90,
      "act-2": 75,
      "act-3": 65,
      finale: 55,
    });
    expect(EXPERT_CELL_TARGET).toBe(90);
    expect(EXPERT_TARGET_ALLOWANCE).toBe(1);
    expect(TARGETED_CELLS).toEqual([
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
    ]);
  });

  it("ask the expert for ⌈90%⌉ of its runs, in whole numbers", () => {
    expect([8, 12, 16, 30].map(expertWinsNeeded)).toEqual([8, 11, 15, 27]);
  });

  it("give a band two binomial deviations either side of its target", () => {
    expect(bandTolerance(90, 96)).toBeCloseTo(6.12, 2);
    expect(bandTolerance(75, 128)).toBeCloseTo(7.65, 2);
    expect(bandTolerance(55, 16)).toBeCloseTo(24.87, 2);
    expect(bandTolerance(90, 384)).toBeCloseTo(bandTolerance(90, 96) / 2, 6);
  });

  it("mark an expert met, inside the one-seed allowance, or short", () => {
    const pins = expertTargetPins([
      row("met", "act-1", "expert", 15),
      row("close", "act-1", "expert", 14),
      row("short", "act-1", "expert", 13),
      row("met", "act-1", "new", 0),
      row("met", "act-1", "expert", 0, 16, "new"),
    ]);
    expect(pins.map((pin) => [pin.cell, pin.needed, pin.verdict])).toEqual([
      ["met", 15, "met"],
      ["close", 15, "allowance"],
      ["short", 15, "short"],
    ]);
  });

  it("pool the new player's wins over the band, on target inside the tolerance, low or high outside it", () => {
    const rows = [
      // act-1: 86/96 = 89.6%, inside 90 ± 6.1
      ...[16, 16, 16, 14, 12, 12].map((won, i) =>
        row(`one-${String(i)}`, "act-1", "new", won),
      ),
      row("one-0", "act-1", "expert", 0),
      // act-2: 7/32 = 21.9%, far under 75 ± 15.3
      row("two-0", "act-2", "new", 3),
      row("two-1", "act-2", "new", 4),
      // act-3: 16/16, over 65 ± 23.8
      row("three-0", "act-3", "new", 16),
    ];
    expect(
      newPlayerBandPins(rows).map((pin) => [
        pin.band,
        pin.won,
        pin.runs,
        pin.verdict,
      ]),
    ).toEqual([
      ["act-1", 86, 96, "on"],
      ["act-2", 7, 32, "low"],
      ["act-3", 16, 16, "high"],
    ]);
  });

  it("assert only the targeted cells, and a band only once all its cells are targeted and played", () => {
    const rows = [
      row("a/act-1", "act-1", "new", 16),
      row("a/act-1", "act-1", "expert", 10),
      row("b/act-2", "act-2", "new", 12),
      row("b/act-2", "act-2", "expert", 16),
      row("c/act-2", "act-2", "new", 12),
      row("c/act-2", "act-2", "expert", 16),
    ];
    expect(isTargeted("a/act-1", [])).toBe(false);
    expect(targetedExpertPins(rows, [])).toEqual([]);
    expect(targetedBandPins(rows, [], CELLS)).toEqual([]);
    expect(targetedExpertPins(rows, ["b"]).map((pin) => pin.cell)).toEqual([
      "b/act-2",
    ]);
    expect(targetedBandPins(rows, ["b"], CELLS).map((pin) => pin.band)).toEqual(
      [],
    );
    expect(
      targetedBandPins(rows, ["b", "c/act-2"], CELLS).map((pin) => pin.band),
    ).toEqual(["act-2"]);
    const withoutC = rows.filter((r) => r.cell !== "c/act-2");
    expect(targetedBandPins(withoutC, ["b", "c"], CELLS)).toEqual([]);
  });

  it("know every band of the shipped matrix", () => {
    for (const cell of CALIBRATION_CELLS) {
      expect(NEW_PLAYER_BAND_TARGETS[cell.band], cell.id).toBeGreaterThan(0);
    }
  });

  it("log each band's standing and every expert cell not met", () => {
    const rows = [
      row("a/act-1", "act-1", "new", 15),
      row("a/act-1", "act-1", "expert", 14),
      row("b/act-2", "act-2", "expert", 16),
    ];
    expect(
      targetNotes(newPlayerBandPins(rows), expertTargetPins(rows)),
    ).toEqual([
      "new act-1: 15/16 = 93.8% against 90 ± 15.0: on",
      "expert a/act-1: 14/16 against 15: allowance",
    ]);
  });
});

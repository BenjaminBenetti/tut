import { describe, expect, it } from "vitest";

import type { BoardCoreObjective } from "../../../tactical/model/tactical-state";
import { BOARD_CORE_PRESENTATION } from "./board-core-presentation";

// ===========================================
// Fixtures
// ===========================================

const OBJECTIVE: BoardCoreObjective = {
  id: "objective-1",
  kind: "board-core",
  complete: false,
};

/** The row for `objective`. */
function rowFor(objective: BoardCoreObjective) {
  return BOARD_CORE_PRESENTATION.row(objective, {
    ordinal: 1,
    spawners: [],
    progress: undefined,
  });
}

// ===========================================
// Tests
// ===========================================

describe("BOARD_CORE_PRESENTATION (#1179)", () => {
  it("names the hatch, and puts the open row's words under its label, not beside it", () => {
    expect(BOARD_CORE_PRESENTATION.name(OBJECTIVE, 1)).toBe("the hatch");
    expect(rowFor(OBJECTIVE)).toEqual({
      icon: "extract",
      label: "Reach the hatch and board the core",
      data: {},
      layout: "stacked",
      detail: { text: "extract at the hatch", role: "board-core-detail" },
    });
  });

  it("says the rest may follow once someone is aboard, under the label", () => {
    expect(rowFor({ ...OBJECTIVE, complete: true })).toEqual({
      icon: "check",
      label: "Boarded the core",
      data: {},
      layout: "stacked",
      detail: { text: "the rest may follow", role: "board-core-detail" },
    });
  });

  it("warns when nobody can reach the hatch", () => {
    expect(rowFor({ ...OBJECTIVE, failed: true })).toMatchObject({
      icon: "warning",
      label: "Nobody reached the hatch",
    });
  });
});

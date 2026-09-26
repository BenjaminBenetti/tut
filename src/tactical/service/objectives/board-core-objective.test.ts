import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import { extract } from "../../model/extract-command";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type {
  BoardCoreObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { missionOutcome } from "../mission-end-service";
import { stagePending } from "../mission-stage-service";
import { createExtractHandler } from "../objective-service";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "../tactical-fixtures.test-helper";
import {
  BOARD_CORE_OBJECTIVE,
  boardCoreOnExtracted,
  hasBoarded,
  hatchTile,
} from "./board-core-objective";
import { objectiveComplete, objectiveFailed } from "./objective-status";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** The hatch: four tiles in the far corner, its middle (7, 6). */
const HATCH = [at(6, 6), at(7, 6), at(6, 7), at(7, 7)];

const OBJECTIVE: BoardCoreObjective = {
  id: "objective-1",
  kind: "board-core",
  complete: false,
};

/** The hull, stage 1 of 2, with the units on it and the hatch as its extraction. */
function hull(units: readonly Unit[], extracted: readonly Unit[] = []) {
  return {
    ...missionWith(openField().build(), units, {
      objectives: [OBJECTIVE],
      extracted,
    }),
    extraction: HATCH,
    stage: { index: 0, count: 2, earlier: [] },
  };
}

const objectiveOf = (state: TacticalState) =>
  state.objectives[0] as BoardCoreObjective;

// ===========================================
// Reading the hull
// ===========================================

describe("board-core (campaign arc §6.9)", () => {
  it("is done once a squad or mech of ours has gone through the hatch, and only then", () => {
    const mech = unitAt("mech-1", "mech", at(6, 6));
    expect(hasBoarded(hull([mech]))).toBe(false);
    expect(hasBoarded(hull([], [mech]))).toBe(true);
    const turret: Unit = { ...mech, id: "t", kind: "turret" };
    expect(hasBoarded(hull([], [turret]))).toBe(false);
    expect(BOARD_CORE_OBJECTIVE.complete(OBJECTIVE, hull([], [mech]))).toBe(
      true,
    );
    expect(BOARD_CORE_OBJECTIVE.tally?.(OBJECTIVE, hull([], [mech]))).toEqual({
      done: 1,
      total: 1,
    });
    expect(BOARD_CORE_OBJECTIVE.tally?.(OBJECTIVE, hull([mech]))).toEqual({
      done: 0,
      total: 1,
    });
  });

  it("is lost once nobody went through and nobody of ours is left to", () => {
    const dead = unitAt("mech-1", "mech", at(1, 1), { hp: 0 });
    const lost = hull([dead]);
    expect(objectiveFailed(lost, OBJECTIVE)).toBe(true);
    expect(
      objectiveFailed(hull([unitAt("s", "infantry", at(1, 1))]), OBJECTIVE),
    ).toBe(false);
    expect(
      objectiveFailed(
        hull([dead], [unitAt("s", "infantry", at(6, 6))]),
        OBJECTIVE,
      ),
    ).toBe(false);
  });

  it("points the squad at the hatch's middle tile", () => {
    expect(hatchTile(hull([]))).toEqual(at(6, 7));
    expect(BOARD_CORE_OBJECTIVE.destination?.(OBJECTIVE, hull([]))).toEqual({
      position: at(6, 7),
    });
    expect(hatchTile(missionWith(openField().build(), []))).toBeUndefined();
  });

  it("ticks on the first unit through, and ignores a bug or an objective already done", () => {
    const mech = unitAt("mech-1", "mech", at(6, 6));
    const heard = boardCoreOnExtracted(OBJECTIVE, hull([], [mech]), mech);
    expect(objectiveOf(heard.state).complete).toBe(true);
    expect(heard.events).toEqual([
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: OBJECTIVE.id, complete: true },
      },
    ]);
    const bug = unitAt("b", "infantry", at(6, 6), { team: "bugs" });
    expect(boardCoreOnExtracted(OBJECTIVE, hull([]), bug).events).toEqual([]);
    const done = { ...OBJECTIVE, complete: true };
    expect(boardCoreOnExtracted(done, hull([], [mech]), mech).events).toEqual(
      [],
    );
  });
});

// ===========================================
// Through the Extract handler
// ===========================================

describe("boarding the core through Extract", () => {
  const extractAt = createExtractHandler(OBJECTIVE_TUNING);
  const ctx = ctxWith(riggedRng(true));

  it("wins the hull once the last unit standing goes through with someone aboard, and leaves the core pending", () => {
    const mech = unitAt("mech-1", "mech", at(6, 6));
    const squad = unitAt("squad-1", "infantry", at(7, 7));
    const first = extractAt(hull([mech, squad]), extract("mech-1"), ctx);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(objectiveOf(first.value.state).complete).toBe(true);
    expect(first.value.state.outcome).toBeUndefined();
    const second = extractAt(first.value.state, extract("squad-1"), ctx);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.state.outcome).toBe("won");
    expect(stagePending(second.value.state)).toBe(true);
  });

  it("wins the hull when one boarded and the rest fell on the deck", () => {
    const mech = unitAt("mech-1", "mech", at(6, 6));
    const fallen = unitAt("squad-1", "infantry", at(1, 1), { hp: 0 });
    const boarded = extractAt(hull([mech, fallen]), extract("mech-1"), ctx);
    expect(boarded.ok && boarded.value.state.outcome).toBe("won");
  });

  it("loses the mission when nobody reached the hatch", () => {
    const fallen = unitAt("mech-1", "mech", at(1, 1), { hp: 0 });
    const state = hull([fallen]);
    expect(missionOutcome(state)).toBe("lost");
    expect(objectiveComplete(state, OBJECTIVE)).toBe(false);
  });
});

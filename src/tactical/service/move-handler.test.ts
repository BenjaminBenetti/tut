import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { move } from "../model/move-command";
import type { TacticalContext } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { UNIT_MOVED } from "../model/unit-moved-event";
import { moveHandler } from "./move-handler";
import {
  missionWith,
  openField,
  twoFloorBuilding,
  unitAt,
  walledField,
} from "./movement-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });

const ctx: TacticalContext = {
  rng: new Mulberry32Rng(1),
  ids: new SequentialIdGenerator(),
};

/** Runs a move and returns the rejection reason, or `undefined` when it was applied. */
function reasonOf(
  mission: TacticalState,
  unitId: string,
  path: TileCoord[],
): string | undefined {
  const outcome = moveHandler(mission, move(unitId, path), ctx);
  if (outcome.ok) {
    return undefined;
  }
  return outcome.error.kind === "illegal-move"
    ? outcome.error.reason
    : outcome.error.kind;
}

// ===========================================
// Tests
// ===========================================

describe("moveHandler", () => {
  it("walks the path, spends action points per block of move tiles, faces the last step and emits one event per step", () => {
    const mission = missionWith(openField().build(), [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("other", "mech", at(7, 7)),
    ]);
    const path = [at(1, 0), at(2, 0), at(2, 1), at(2, 2)];
    const outcome = moveHandler(mission, move("u", path), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const moved = outcome.value.state.units.find((u) => u.id === "u");
    expect(moved?.pos).toEqual(at(2, 2));
    expect(moved?.ap).toBe(0);
    expect(moved?.facing).toBe("s");
    expect(outcome.value.state.units.find((u) => u.id === "other")).toBe(
      mission.units[1],
    );
    expect(outcome.value.events).toEqual([
      {
        type: UNIT_MOVED,
        payload: {
          unitId: "u",
          from: at(0, 0),
          to: at(1, 0),
          path: [at(1, 0)],
        },
      },
      {
        type: UNIT_MOVED,
        payload: {
          unitId: "u",
          from: at(1, 0),
          to: at(2, 0),
          path: [at(2, 0)],
        },
      },
      {
        type: UNIT_MOVED,
        payload: {
          unitId: "u",
          from: at(2, 0),
          to: at(2, 1),
          path: [at(2, 1)],
        },
      },
      {
        type: UNIT_MOVED,
        payload: {
          unitId: "u",
          from: at(2, 1),
          to: at(2, 2),
          path: [at(2, 2)],
        },
      },
    ]);
    expect(mission.units[0]?.pos).toEqual(at(0, 0));
    expect(mission.units[0]?.ap).toBe(2);
  });

  it("charges a single action for a path within one move", () => {
    const mission = missionWith(openField().build(), [
      unitAt("u", "mech", at(4, 4)),
    ]);
    const outcome = moveHandler(
      mission,
      move("u", [at(4, 3), at(4, 2), at(3, 2)]),
      ctx,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const moved = outcome.value.state.units[0];
    expect(moved?.ap).toBe(1);
    expect(moved?.facing).toBe("w");
  });

  it("climbs into a building and keeps the horizontal facing across the stairs", () => {
    const mission = missionWith(twoFloorBuilding(), [
      unitAt("u", "infantry", at(3, 5)),
    ]);
    const path = [at(4, 5), at(5, 5), at(5, 6), at(5, 5, 1)];
    const outcome = moveHandler(mission, move("u", path), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.state.units[0]?.pos).toEqual(at(5, 5, 1));
    expect(outcome.value.state.units[0]?.facing).toBe("n");
    expect(outcome.value.events).toHaveLength(4);
  });

  it("lets bugs move in the bug phase and refuses the wrong side", () => {
    const base = missionWith(openField().build(), [
      unitAt("bug", "infantry", at(0, 0), { team: "bugs" }),
      unitAt("u", "infantry", at(7, 7)),
    ]);
    expect(reasonOf(base, "bug", [at(1, 0)])).toBe("wrong-phase");
    const bugPhase: TacticalState = { ...base, phase: "bugs" };
    expect(reasonOf(bugPhase, "bug", [at(1, 0)])).toBeUndefined();
    expect(reasonOf(bugPhase, "u", [at(6, 7)])).toBe("wrong-phase");
  });

  it("rejects an unknown, down, or spent unit and an empty or over-long path", () => {
    const map = openField().build();
    expect(reasonOf(missionWith(map, []), "ghost", [at(1, 0)])).toBe(
      "unit-not-found",
    );
    expect(
      reasonOf(
        missionWith(map, [unitAt("u", "infantry", at(0, 0), { hp: 0 })]),
        "u",
        [at(1, 0)],
      ),
    ).toBe("unit-down");
    expect(
      reasonOf(
        missionWith(map, [unitAt("u", "infantry", at(0, 0), { ap: 0 })]),
        "u",
        [at(1, 0)],
      ),
    ).toBe("over-budget");
    const fresh = missionWith(map, [unitAt("u", "infantry", at(0, 0))]);
    expect(reasonOf(fresh, "u", [])).toBe("empty-path");
    const seven = [1, 2, 3, 4, 5, 6, 7].map((x) => at(x, 0));
    expect(reasonOf(fresh, "u", seven)).toBe("over-budget");
  });

  it("rejects tiles it cannot enter: through a wall, onto a unit, off the map, or by teleporting", () => {
    const walled = missionWith(walledField(), [unitAt("u", "mech", at(3, 2))]);
    expect(reasonOf(walled, "u", [at(4, 2)])).toBe("unreachable");
    const crowded = missionWith(openField().build(), [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("ally", "infantry", at(1, 0)),
    ]);
    expect(reasonOf(crowded, "u", [at(1, 0)])).toBe("unreachable");
    expect(reasonOf(crowded, "u", [at(0, -1)])).toBe("unreachable");
    expect(reasonOf(crowded, "u", [at(0, 1), at(2, 1)])).toBe("not-a-step");
    expect(
      reasonOf(crowded, "u", [at(0, 1), at(1, 1), at(2, 1)]),
    ).toBeUndefined();
  });

  it("rejects a legal-looking path that loops past the budget", () => {
    const mission = missionWith(openField().build(), [
      unitAt("u", "infantry", at(0, 0)),
    ]);
    const loop = [
      at(1, 0),
      at(0, 0),
      at(1, 0),
      at(0, 0),
      at(1, 0),
      at(0, 0),
      at(1, 0),
    ];
    expect(reasonOf(mission, "u", loop)).toBe("over-budget");
    expect(reasonOf(mission, "u", loop.slice(0, 6))).toBeUndefined();
  });
});

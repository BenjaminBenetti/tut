import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import { overwatch } from "../model/overwatch-command";
import { UNIT_STATUS_CHANGED } from "../model/unit-status-changed-event";
import { overwatchHandler } from "./overwatch-handler";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });
const ctx = ctxWith(riggedRng(true));

// ===========================================
// Tests
// ===========================================

describe("overwatchHandler", () => {
  it("puts a unit on overwatch, spends its remaining actions and announces the status", () => {
    const mission = missionWith(openField().build(), [
      unitAt("u", "infantry", at(0, 0), { ap: 1, status: ["suppressed"] }),
      unitAt("b", "infantry", at(7, 7), { team: "bugs" }),
    ]);
    const outcome = overwatchHandler(mission, overwatch("u"), ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const unit = outcome.value.state.units[0];
    expect(unit?.ap).toBe(0);
    expect(unit?.status).toEqual(["suppressed", "overwatch"]);
    expect(outcome.value.state.units[1]).toBe(mission.units[1]);
    expect(outcome.value.events).toEqual([
      {
        type: UNIT_STATUS_CHANGED,
        payload: { unitId: "u", status: ["suppressed", "overwatch"] },
      },
    ]);
    expect(mission.units[0]?.ap).toBe(1);
  });

  it("does not list the status twice", () => {
    const mission = missionWith(openField().build(), [
      unitAt("u", "infantry", at(0, 0), { ap: 2, status: ["overwatch"] }),
    ]);
    const outcome = overwatchHandler(mission, overwatch("u"), ctx);
    expect(outcome.ok && outcome.value.state.units[0]?.status).toEqual([
      "overwatch",
    ]);
  });

  it("rejects a missing, down, out-of-phase or spent unit", () => {
    const map = openField().build();
    const kindOf = (mission: ReturnType<typeof missionWith>, id: string) => {
      const outcome = overwatchHandler(mission, overwatch(id), ctx);
      return outcome.ok ? "ok" : outcome.error.kind;
    };
    expect(kindOf(missionWith(map, []), "ghost")).toBe("unit-not-on-map");
    expect(
      kindOf(
        missionWith(map, [unitAt("u", "infantry", at(0, 0), { hp: 0 })]),
        "u",
      ),
    ).toBe("unit-dead");
    expect(
      kindOf(
        missionWith(map, [unitAt("b", "infantry", at(0, 0), { team: "bugs" })]),
        "b",
      ),
    ).toBe("wrong-phase");
    expect(
      kindOf(
        missionWith(map, [unitAt("u", "infantry", at(0, 0), { ap: 0 })]),
        "u",
      ),
    ).toBe("no-action-points");
    expect(
      kindOf(
        missionWith(
          map,
          [unitAt("b", "infantry", at(0, 0), { team: "bugs" })],
          { phase: "bugs" },
        ),
        "b",
      ),
    ).toBe("ok");
  });
});

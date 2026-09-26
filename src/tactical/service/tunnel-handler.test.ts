import { describe, expect, it } from "vitest";

import { tunnel } from "../model/tunnel-command";
import { UNIT_TUNNELLED } from "../model/unit-tunnelled-event";
import { isBurrowed } from "../model/unit";
import {
  burrowerAt,
  ctxWith,
  missionWith,
  riggedRng,
  walledField,
} from "./tactical-fixtures.test-helper";
import { tunnelHandler } from "./tunnel-handler";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): { x: number; y: number; z: number } => ({
  x,
  y: 0,
  z,
});

// ===========================================
// Tunnel
// ===========================================

describe("the Tunnel handler", () => {
  it("moves it under the wall to the column, still burrowed, for the actions the columns cost", () => {
    const digger = burrowerAt("d", at(2, 5));
    const mission = missionWith(walledField(), [digger], { phase: "bugs" });
    const applied = tunnelHandler(
      mission,
      tunnel("d", at(6, 5)),
      ctxWith(riggedRng(true)),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const moved = applied.value.state.units[0];
    expect(moved?.pos).toEqual(at(6, 5));
    expect(moved?.ap).toBe(0);
    expect(moved === undefined ? false : isBurrowed(moved)).toBe(true);
    expect(moved?.facing).toBe(digger.facing);
    // One event, and it is not a walk: the scene never places it.
    expect(applied.value.events).toEqual([
      {
        type: UNIT_TUNNELLED,
        payload: { unitId: "d", from: at(2, 5), to: at(6, 5) },
      },
    ]);
    // Pure: the input is untouched.
    expect(mission.units[0]).toBe(digger);
  });

  it("is refused as validateTunnel says", () => {
    const digger = burrowerAt("d", at(2, 5));
    const mission = missionWith(walledField(), [digger], { phase: "bugs" });
    expect(
      tunnelHandler(mission, tunnel("d", at(7, 0)), ctxWith(riggedRng(true))),
    ).toEqual({
      ok: false,
      error: { kind: "illegal-move", unitId: "d", reason: "unreachable" },
    });
  });
});

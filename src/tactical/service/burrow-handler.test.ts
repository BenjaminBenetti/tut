import { describe, expect, it } from "vitest";

import { BURROW_TUNING } from "../data/burrow-tuning";
import { burrow } from "../model/burrow-command";
import { isBurrowed } from "../model/unit";
import { UNIT_BURROWED } from "../model/unit-burrowed-event";
import { createBurrowHandler } from "./burrow-handler";
import {
  burrowerAt,
  ctxWith,
  missionWith,
  openField,
  riggedRng,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): { x: number; y: number; z: number } => ({
  x,
  y: 0,
  z,
});

const handler = createBurrowHandler(BURROW_TUNING);

// ===========================================
// Burrow
// ===========================================

describe("the Burrow handler", () => {
  it("takes a surfaced burrower back under the ground for one action, once its cooldown has run", () => {
    const up = {
      ...burrowerAt("d", at(3, 3), { status: [] }),
      surfacedOnTurn: 2,
    };
    const mission = missionWith(openField().build(), [up], {
      phase: "bugs",
      turn: 2 + BURROW_TUNING.reburrowCooldownTurns,
    });
    const applied = handler(mission, burrow("d"), ctxWith(riggedRng(true)));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const down = applied.value.state.units[0];
    expect(down === undefined ? false : isBurrowed(down)).toBe(true);
    expect(down?.ap).toBe(2 - BURROW_TUNING.burrowApCost);
    expect(down?.pos).toEqual(at(3, 3));
    expect(applied.value.events).toEqual([
      { type: UNIT_BURROWED, payload: { unitId: "d", pos: at(3, 3) } },
    ]);
  });

  it("is refused inside the cooldown", () => {
    const up = {
      ...burrowerAt("d", at(3, 3), { status: [] }),
      surfacedOnTurn: 2,
    };
    const mission = missionWith(openField().build(), [up], {
      phase: "bugs",
      turn: 2,
    });
    expect(handler(mission, burrow("d"), ctxWith(riggedRng(true)))).toEqual({
      ok: false,
      error: { kind: "illegal-burrow", unitId: "d", reason: "cooldown" },
    });
  });
});

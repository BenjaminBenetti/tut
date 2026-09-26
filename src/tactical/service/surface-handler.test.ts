import { describe, expect, it } from "vitest";

import { TileIndex } from "../../mapgen/service/tile-index";
import { BURROW_TUNING } from "../data/burrow-tuning";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import { surface } from "../model/surface-command";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { isBurrowed, passMaskFor } from "../model/unit";
import { UNIT_SURFACED } from "../model/unit-surfaced-event";
import { allows } from "../../mapgen/model/pass-mask";
import { createSurfaceHandler } from "./surface-handler";
import {
  burrowerAt,
  ctxWith,
  fixtureAttackDeps,
  missionWith,
  openField,
  riggedRng,
  unitAt,
} from "./tactical-fixtures.test-helper";
import { createOverwatchReaction, overwatchReaction } from "./turn-service";
import { tunnelHandler } from "./tunnel-handler";
import { tunnel } from "../model/tunnel-command";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): { x: number; y: number; z: number } => ({
  x,
  y: 0,
  z,
});

/** The unit with the id; throws when it is missing. */
function unitIn(mission: TacticalState, id: string): Unit {
  const unit = mission.units.find((candidate) => candidate.id === id);
  if (unit === undefined) throw new Error(`no unit ${id}`);
  return unit;
}

const plain = createSurfaceHandler(BURROW_TUNING);

// ===========================================
// Coming up
// ===========================================

describe("the Surface handler", () => {
  it("comes up beside its mark on a free, standable tile, facing it, one action spent", () => {
    const digger = burrowerAt("d", at(3, 3));
    const squad = unitAt("s", "infantry", at(3, 2));
    const mission = missionWith(openField().build(), [digger, squad], {
      phase: "bugs",
      turn: 4,
    });
    const applied = plain(mission, surface("d"), ctxWith(riggedRng(true)));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const up = unitIn(applied.value.state, "d");
    expect(isBurrowed(up)).toBe(false);
    expect(up.pos).toEqual(at(3, 3));
    expect(up.ap).toBe(2 - BURROW_TUNING.surfaceApCost);
    expect(up.surfacedOnTurn).toBe(4);
    // North is −z: the squad at z = 2 is north of it.
    expect(up.facing).toBe("n");
    expect(applied.value.events).toEqual([
      {
        type: UNIT_SURFACED,
        payload: { unitId: "d", pos: at(3, 3), beside: ["s"] },
      },
    ]);
    // Free and standable: nobody else on the tile, and infantry may stand.
    const index = new TileIndex(mission.map);
    const tile = index.getAt(up.pos);
    expect(
      tile !== undefined && allows(tile.pass, passMaskFor(up.passClass)),
    ).toBe(true);
    expect(
      applied.value.state.units.filter(
        (unit) =>
          unit.hp > 0 &&
          unit.pos.x === up.pos.x &&
          unit.pos.z === up.pos.z &&
          unit.pos.y === up.pos.y,
      ),
    ).toHaveLength(1);
  });

  it("names nobody when it comes up alone, and keeps its facing", () => {
    const digger = { ...burrowerAt("d", at(3, 3)), facing: "w" as const };
    const mission = missionWith(openField().build(), [digger], {
      phase: "bugs",
    });
    const applied = plain(mission, surface("d"), ctxWith(riggedRng(true)));
    expect(applied.ok && applied.value.events[0]?.payload).toEqual({
      unitId: "d",
      pos: at(3, 3),
      beside: [],
    });
    expect(applied.ok && unitIn(applied.value.state, "d").facing).toBe("w");
  });

  it("is refused as validateSurface says, changing nothing", () => {
    const up = burrowerAt("d", at(3, 3), { status: [] });
    const mission = missionWith(openField().build(), [up], { phase: "bugs" });
    expect(plain(mission, surface("d"), ctxWith(riggedRng(true)))).toEqual({
      ok: false,
      error: { kind: "illegal-burrow", unitId: "d", reason: "not-burrowed" },
    });
  });
});

// ===========================================
// Overwatch
// ===========================================

describe("overwatch against a burrower", () => {
  const react = createOverwatchReaction(COMBAT_TUNING, fixtureAttackDeps());
  const withWatch = createSurfaceHandler(BURROW_TUNING, react);

  /** A watcher at (1, 1) with a clear field of fire, and a digger at (4, 1). */
  function watched(): TacticalState {
    return missionWith(
      openField().build(),
      [
        unitAt("w", "infantry", at(1, 1), { ap: 0, status: ["overwatch"] }),
        burrowerAt("d", at(4, 1)),
      ],
      { phase: "bugs" },
    );
  }

  it("draws no shot while it tunnels past, even straight under the watcher's gaze", () => {
    const moved = tunnelHandler(
      watched(),
      tunnel("d", at(2, 2)),
      ctxWith(riggedRng(true)),
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(
      moved.value.events.filter((event) => event.type === ATTACK_RESOLVED),
    ).toEqual([]);
    expect(unitIn(moved.value.state, "w").status).toEqual(["overwatch"]);
  });

  it("is never fired on by a watch while it is under the ground, wherever it is", () => {
    // Straight at the reaction, as a step of any kind would call it: the
    // watcher is in range with a clear line, and the dice always hit.
    for (const pos of [at(4, 1), at(2, 1), at(1, 2)]) {
      const mission = watched();
      const moved = {
        ...mission,
        units: mission.units.map((unit) =>
          unit.id === "d" ? { ...unit, pos } : unit,
        ),
      };
      const reaction = overwatchReaction(
        moved,
        "d",
        ctxWith(riggedRng(true)),
        COMBAT_TUNING,
        fixtureAttackDeps(),
      );
      expect(reaction.events).toEqual([]);
      expect(reaction.state).toBe(moved);
    }
  });

  it("draws the watch the moment it comes up, and the shot follows the surfacing", () => {
    const up = withWatch(watched(), surface("d"), ctxWith(riggedRng(true)));
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(up.value.events.map((event) => event.type)).toEqual([
      UNIT_SURFACED,
      ATTACK_RESOLVED,
      "tactical:unit-status-changed",
    ]);
    expect(unitIn(up.value.state, "d").hp).toBeLessThan(10);
  });
});

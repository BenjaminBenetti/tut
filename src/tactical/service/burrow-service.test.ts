import { describe, expect, it } from "vitest";

import { SurfaceIds } from "../../mapgen/data/surfaces";
import { TileIndex } from "../../mapgen/service/tile-index";
import { STOREY_LAYERS } from "../../core/model/elevation";
import { BURROW_TUNING } from "../data/burrow-tuning";
import type { BurrowTuning } from "../model/burrow-tuning";
import {
  blockUnitAt,
  burrowerAt,
  missionWith,
  openField,
  twoFloorBuilding,
  unitAt,
} from "./tactical-fixtures.test-helper";
import {
  burrowCooldownOver,
  canSurfaceOn,
  enemiesBeside,
  validateBurrow,
  validateSurface,
  validateTunnel,
} from "./burrow-service";

// ===========================================
// Fixtures
// ===========================================

const T: BurrowTuning = BURROW_TUNING;

/** The ground-level coordinate at `(x, z)`. */
function at(x: number, z: number): { x: number; y: number; z: number } {
  return { x, y: 0, z };
}

// ===========================================
// Tunnel
// ===========================================

describe("validateTunnel", () => {
  it("charges a walk's action points for the columns crossed", () => {
    const digger = burrowerAt("d", at(1, 1));
    const mission = missionWith(openField().build(), [digger], {
      phase: "bugs",
    });
    const near = validateTunnel(mission, "d", at(3, 1));
    expect(near.ok && near.value.apCost).toBe(1);
    expect(near.ok && near.value.to).toMatchObject(at(3, 1));
    const far = validateTunnel(mission, "d", at(4, 3));
    expect(far.ok && far.value.apCost).toBe(2);
  });

  it("refuses a digger on the surface, one that cannot dig, and one out of its phase", () => {
    const up = burrowerAt("up", at(1, 1), { status: [] });
    const walker = unitAt("walker", "infantry", at(5, 5), { team: "bugs" });
    const digger = burrowerAt("d", at(2, 2));
    const bugs = missionWith(openField().build(), [up, walker, digger], {
      phase: "bugs",
    });
    expect(validateTunnel(bugs, "up", at(2, 1))).toEqual({
      ok: false,
      error: { kind: "illegal-burrow", unitId: "up", reason: "not-burrowed" },
    });
    expect(validateTunnel(bugs, "walker", at(5, 6))).toEqual({
      ok: false,
      error: {
        kind: "illegal-burrow",
        unitId: "walker",
        reason: "not-a-burrower",
      },
    });
    expect(validateTunnel(bugs, "ghost", at(5, 6))).toEqual({
      ok: false,
      error: { kind: "unit-not-on-map", unitId: "ghost" },
    });
    const players = { ...bugs, phase: "player" as const };
    expect(validateTunnel(players, "d", at(2, 3))).toEqual({
      ok: false,
      error: { kind: "wrong-phase", unitId: "d" },
    });
  });

  it("refuses its own column, a column out of reach and a column someone holds", () => {
    const digger = burrowerAt("d", at(1, 1));
    const squad = unitAt("s", "infantry", at(2, 1));
    const mission = missionWith(openField().build(), [digger, squad], {
      phase: "bugs",
    });
    const reason = (to: { x: number; y: number; z: number }): unknown => {
      const result = validateTunnel(mission, "d", to);
      return result.ok ? "ok" : result.error;
    };
    expect(reason(at(1, 1))).toEqual({
      kind: "illegal-move",
      unitId: "d",
      reason: "empty-path",
    });
    expect(reason(at(7, 7))).toEqual({
      kind: "illegal-move",
      unitId: "d",
      reason: "unreachable",
    });
    expect(reason({ x: 20, y: 0, z: 1 })).toEqual({
      kind: "illegal-move",
      unitId: "d",
      reason: "unreachable",
    });
    expect(reason(at(2, 1))).toEqual({
      kind: "illegal-burrow",
      unitId: "d",
      reason: "tile-held",
    });
  });

  it("will not end on a floor above the ground, only on the ground tile", () => {
    const digger = burrowerAt("d", at(3, 5));
    const mission = missionWith(twoFloorBuilding(), [digger], {
      phase: "bugs",
    });
    const upstairs = validateTunnel(mission, "d", {
      x: 5,
      y: STOREY_LAYERS,
      z: 5,
    });
    expect(upstairs.ok).toBe(false);
    expect(validateTunnel(mission, "d", at(5, 5)).ok).toBe(true);
  });
});

// ===========================================
// Surface
// ===========================================

describe("validateSurface and canSurfaceOn", () => {
  it("comes up on ground its class can stand on that nobody holds", () => {
    const digger = burrowerAt("d", at(2, 2));
    const mission = missionWith(openField().build(), [digger], {
      phase: "bugs",
    });
    const up = validateSurface(mission, "d", T);
    expect(up.ok && up.value.tile).toMatchObject(at(2, 2));
  });

  it("finds no footing under a crate, and no room under a spawner", () => {
    const map = openField().patchTile(at(2, 2), { pass: 0 }).build();
    const crated = burrowerAt("d", at(2, 2));
    const mission = missionWith(map, [crated], { phase: "bugs" });
    expect(validateSurface(mission, "d", T)).toEqual({
      ok: false,
      error: { kind: "illegal-burrow", unitId: "d", reason: "no-footing" },
    });
    const nested = missionWith(
      openField().build(),
      [burrowerAt("d", at(4, 4))],
      {
        phase: "bugs",
        spawners: [
          {
            id: "egg",
            pos: at(4, 4),
            hatchRadius: 1,
            hp: 5,
            timer: 1,
            destroyed: false,
          },
        ],
      },
    );
    expect(validateSurface(nested, "d", T)).toEqual({
      ok: false,
      error: { kind: "illegal-burrow", unitId: "d", reason: "tile-held" },
    });
  });

  it("will not come up under a squad that walked onto its tile, or a brute's block", () => {
    // A burrowed unit holds no tile, so the squad could stand there.
    const digger = burrowerAt("d", at(3, 3));
    const squad = unitAt("s", "infantry", at(3, 3));
    const mission = missionWith(openField().build(), [digger, squad], {
      phase: "bugs",
    });
    expect(validateSurface(mission, "d", T)).toEqual({
      ok: false,
      error: { kind: "illegal-burrow", unitId: "d", reason: "tile-held" },
    });
    const index = new TileIndex(mission.map);
    const block = blockUnitAt("brute", at(5, 5));
    const blocked = missionWith(openField().build(), [digger, block]);
    const underBlock = index.getAt(at(6, 6));
    expect(
      underBlock === undefined
        ? undefined
        : canSurfaceOn(blocked, digger, underBlock, index),
    ).toBe(false);
  });

  it("needs its action point to come up", () => {
    const tired = burrowerAt("d", at(2, 2), { ap: 0 });
    const mission = missionWith(openField().build(), [tired], {
      phase: "bugs",
    });
    expect(validateSurface(mission, "d", T)).toEqual({
      ok: false,
      error: { kind: "no-action-points", unitId: "d" },
    });
  });
});

// ===========================================
// Burrow
// ===========================================

describe("validateBurrow and burrowCooldownOver", () => {
  it("waits out the cooldown after it last came up", () => {
    const tuning: BurrowTuning = { ...T, reburrowCooldownTurns: 2 };
    expect(burrowCooldownOver({}, 1, tuning)).toBe(true);
    expect(burrowCooldownOver({ surfacedOnTurn: 4 }, 4, tuning)).toBe(false);
    expect(burrowCooldownOver({ surfacedOnTurn: 4 }, 5, tuning)).toBe(false);
    expect(burrowCooldownOver({ surfacedOnTurn: 4 }, 6, tuning)).toBe(true);
    const up = { ...burrowerAt("d", at(2, 2), { status: [] }) };
    const early = missionWith(
      openField().build(),
      [{ ...up, surfacedOnTurn: 3 }],
      { phase: "bugs", turn: 4 },
    );
    expect(validateBurrow(early, "d", tuning)).toEqual({
      ok: false,
      error: { kind: "illegal-burrow", unitId: "d", reason: "cooldown" },
    });
    const later = { ...early, turn: 5 };
    expect(validateBurrow(later, "d", tuning).ok).toBe(true);
  });

  it("digs only through the ground tile, not a floor above it or bedrock", () => {
    const upstairs = burrowerAt(
      "d",
      { x: 6, y: STOREY_LAYERS, z: 6 },
      { status: [] },
    );
    const building = missionWith(twoFloorBuilding(), [upstairs], {
      phase: "bugs",
    });
    expect(validateBurrow(building, "d", T)).toEqual({
      ok: false,
      error: { kind: "illegal-burrow", unitId: "d", reason: "hard-ground" },
    });
    const rock = openField().tile(at(2, 2), SurfaceIds.BEDROCK).build();
    const onRock = missionWith(
      rock,
      [burrowerAt("d", at(2, 2), { status: [] })],
      { phase: "bugs" },
    );
    expect(validateBurrow(onRock, "d", T)).toEqual({
      ok: false,
      error: { kind: "illegal-burrow", unitId: "d", reason: "hard-ground" },
    });
  });

  it("refuses one already under the ground", () => {
    const mission = missionWith(
      openField().build(),
      [burrowerAt("d", at(2, 2))],
      { phase: "bugs" },
    );
    expect(validateBurrow(mission, "d", T)).toEqual({
      ok: false,
      error: {
        kind: "illegal-burrow",
        unitId: "d",
        reason: "already-burrowed",
      },
    });
  });
});

// ===========================================
// Beside
// ===========================================

describe("enemiesBeside", () => {
  it("names the living, unburrowed enemies within arm's reach", () => {
    const digger = burrowerAt("d", at(3, 3));
    const mission = missionWith(openField().build(), [
      digger,
      unitAt("east", "infantry", at(4, 3)),
      unitAt("corner", "infantry", at(4, 4)),
      unitAt("far", "infantry", at(6, 3)),
      unitAt("dead", "infantry", at(2, 3), { hp: 0 }),
      unitAt("friend", "infantry", at(3, 4), { team: "bugs" }),
    ]);
    // A bite reaches the four sides, not the corners (`MELEE_RANGE` over
    // `attackDistance`), so the unit on the diagonal is not beside it.
    expect(enemiesBeside(mission, digger, at(3, 3))).toEqual(["east"]);
    expect(enemiesBeside(mission, digger, at(4, 5))).toEqual(["corner"]);
  });
});

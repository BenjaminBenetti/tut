import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { BugUnitSource } from "../model/bug-unit-source";
import { isBurrowed } from "../model/unit";
import { SPAWN_SEARCH_RADIUS, spawnBurrowerAt } from "./burrower-spawn-service";
import {
  burrowerAt,
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** A digging species with the burrower's shape; tactical never imports bug data. */
const DIGGER: BugUnitSource = {
  id: "burrower",
  name: "Burrower",
  hp: 14,
  armor: 1,
  move: 5,
  ap: 2,
  weapon: { range: 1, accuracy: 75, damage: 8, armorPen: 1 },
  sightRange: 12,
  modelId: "bug.burrower",
  burrows: true,
};

const at = (x: number, z: number): { x: number; y: number; z: number } => ({
  x,
  y: 0,
  z,
});

// ===========================================
// Spawning
// ===========================================

describe("spawnBurrowerAt", () => {
  it("puts a burrower under the mouth's column, burrowed, with no actions yet", () => {
    const mission = missionWith(openField().build(), []);
    const spawned = spawnBurrowerAt(mission, at(4, 4), {
      ids: new SequentialIdGenerator(),
      species: DIGGER,
    });
    expect(spawned.ok).toBe(true);
    if (!spawned.ok) return;
    const unit = spawned.value.state.units.find(
      (candidate) => candidate.id === spawned.value.unitId,
    );
    expect(unit?.pos).toEqual(at(4, 4));
    expect(unit === undefined ? false : isBurrowed(unit)).toBe(true);
    expect(unit?.ap).toBe(0);
    expect(unit?.team).toBe("bugs");
    expect(spawned.value.state.templates["bug:burrower"]?.burrows).toBe(true);
    // The input mission is untouched.
    expect(mission.units).toEqual([]);
  });

  it("goes under the nearest free column when the mouth is held, the same way every time", () => {
    const mission = missionWith(openField().build(), [
      unitAt("s", "infantry", at(4, 4)),
      burrowerAt("b", at(3, 4)),
    ]);
    const deps = () => ({
      ids: new SequentialIdGenerator(),
      species: DIGGER,
    });
    const first = spawnBurrowerAt(mission, at(4, 4), deps());
    const again = spawnBurrowerAt(mission, at(4, 4), deps());
    expect(first).toEqual(again);
    if (!first.ok) throw new Error("expected a spawn");
    const unit = first.value.state.units.at(-1);
    // Ring 1 in x-then-z order: (3,4) is under a burrower, so (4,3).
    expect(unit?.pos).toEqual(at(4, 3));
  });

  it("refuses when nothing within the radius can be dug, and when the species does not dig", () => {
    const builder = openField();
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        builder.tile(at(x, z), SurfaceIds.BEDROCK);
      }
    }
    const rock = missionWith(builder.build(), []);
    expect(
      spawnBurrowerAt(rock, at(4, 4), {
        ids: new SequentialIdGenerator(),
        species: DIGGER,
        radius: SPAWN_SEARCH_RADIUS,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "illegal-burrow",
        unitId: "burrower",
        reason: "tile-held",
      },
    });
    const { burrows: _digs, ...walker } = DIGGER;
    expect(
      spawnBurrowerAt(missionWith(openField().build(), []), at(4, 4), {
        ids: new SequentialIdGenerator(),
        species: walker,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "illegal-burrow",
        unitId: "burrower",
        reason: "not-a-burrower",
      },
    });
  });
});

import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { CIVILIAN_SOURCE_ID } from "../../model/civilian";
import type { Objective, TacticalState } from "../../model/tactical-state";
import { missionWith, unitAt } from "../tactical-fixtures.test-helper";
import { joinRescue, placeCivilians } from "./civilian-setup";

// ===========================================
// Fixtures
// ===========================================

/** A ground-floor tile. */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/**
 * A 12×12 field with a deploy corner, a spawner hook, and a civilian
 * hook on each of `groups`, in that order.
 */
function townMap(groups: readonly TileCoord[]): TacticalMap {
  const builder = new FixtureMapBuilder(12, 12, 2)
    .fillGround()
    .deploy([at(0, 0)])
    .objective(HookKinds.EGG_SPAWNER, [at(10, 10)]);
  for (const tile of groups) {
    builder.objective(HookKinds.CIVILIAN, [tile]);
  }
  return builder.build();
}

/** A mission on `map` with one squad and whatever objective it already has. */
function started(map: TacticalMap, objectives: readonly Objective[] = []) {
  return missionWith(map, [unitAt("unit-0", "infantry", at(0, 0))], {
    objectives,
  });
}

const SPAWNER_OBJECTIVE: Objective = {
  id: "objective-0",
  kind: "destroy-spawner",
  targetId: "spawner-0",
  complete: false,
};

// ===========================================
// placeCivilians
// ===========================================

describe("placeCivilians", () => {
  it("puts a trapped group on every civilian hook, in hook order, and one rescue over them", () => {
    const map = townMap([at(6, 2), at(3, 8), at(9, 5)]);
    const placed = placeCivilians(started(map, [SPAWNER_OBJECTIVE]), map, {
      ids: new SequentialIdGenerator(),
      civilian: CIVILIAN_TUNING,
    });

    const groups = placed.units.filter((unit) => unit.kind === "civilian");
    expect(groups.map((unit) => unit.pos)).toEqual([
      at(6, 2),
      at(3, 8),
      at(9, 5),
    ]);
    for (const group of groups) {
      expect(group).toMatchObject({
        team: "tdf",
        sourceId: CIVILIAN_SOURCE_ID,
        hp: CIVILIAN_TUNING.maxHp,
        ap: 0,
        trapped: true,
      });
      expect(placed.templates[group.templateId]?.weapons).toEqual([]);
    }
    // The spawner objective stays first; the rescue is appended.
    const [kept, rescue, ...rest] = placed.objectives;
    expect(kept).toBe(SPAWNER_OBJECTIVE);
    expect(rest).toEqual([]);
    expect(rescue?.id).toMatch(/^objective-/);
    expect(rescue).toEqual({
      id: rescue?.id,
      kind: "rescue-civilians",
      groupIds: groups.map((unit) => unit.id),
      complete: false,
      failed: false,
    });
    expect(new Set(groups.map((unit) => unit.id)).size).toBe(3);
  });

  it("leaves a map with no civilian hooks alone, with no rescue", () => {
    const map = townMap([]);
    const mission = started(map, [SPAWNER_OBJECTIVE]);
    expect(
      placeCivilians(mission, map, {
        ids: new SequentialIdGenerator(),
        civilian: CIVILIAN_TUNING,
      }),
    ).toBe(mission);
  });

  it("is deterministic for the same ids", () => {
    const map = townMap([at(6, 2), at(3, 8)]);
    const place = (): TacticalState =>
      placeCivilians(started(map), map, {
        ids: new SequentialIdGenerator(),
        civilian: CIVILIAN_TUNING,
      });
    expect(place()).toEqual(place());
  });
});

// ===========================================
// joinRescue
// ===========================================

describe("joinRescue", () => {
  it("adds groups to the rescue already there rather than opening a second", () => {
    const map = townMap([at(6, 2)]);
    const ids = new SequentialIdGenerator();
    const placed = placeCivilians(started(map), map, {
      ids,
      civilian: CIVILIAN_TUNING,
    });
    const joined = joinRescue(placed, ["unit-debug"], ids);
    const rescues = joined.objectives.filter(
      (objective) => objective.kind === "rescue-civilians",
    );
    expect(rescues).toHaveLength(1);
    expect(rescues[0]).toMatchObject({
      id: placed.objectives[0]?.id,
      groupIds: [
        placed.units.find((unit) => unit.kind === "civilian")?.id,
        "unit-debug",
      ],
    });
  });

  it("opens a rescue after the mission's objectives when there is none", () => {
    const map = townMap([]);
    const joined = joinRescue(
      started(map, [SPAWNER_OBJECTIVE]),
      ["unit-debug"],
      new SequentialIdGenerator(),
    );
    expect(joined.objectives.map((objective) => objective.kind)).toEqual([
      "destroy-spawner",
      "rescue-civilians",
    ]);
  });
});

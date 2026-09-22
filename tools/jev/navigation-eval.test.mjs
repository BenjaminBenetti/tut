import { describe, it, expect } from "vitest";
import {
  buildCase,
  caseDefinitions,
  applyMove,
  remaining,
  observe,
  RULES,
} from "./navigation-cases.mjs";
import { choicePage } from "./navigation-formats.mjs";
import { captureJev } from "../../src/tactical/ai/jev-request.ts";
import { FixtureMapBuilder } from "../../src/mapgen/service/fixture-map-builder.ts";
import {
  missionWith,
  unitAt,
} from "../../src/tactical/service/tactical-fixtures.test-helper.ts";
import { buildMoveGraph } from "../../src/tactical/service/movement-service.ts";

/** The evaluated command, independent of combat selection or any live API. */
function snapshotOf(mission, goal) {
  const snapshot = captureJev(mission, mission.units[0].id, RULES, {
    entity: `Reach ${goal.id} as quickly as possible.`,
    commander: "",
  });
  return {
    snapshot,
    candidates: snapshot.candidates.filter(
      (candidate) => candidate.category === "move",
    ),
  };
}

/** Tiny opaque-door case isolates why an otherwise legal step is absent from ordinary Jev choices. */
function doorway(blocked = false) {
  const map = new FixtureMapBuilder(3, 1, 1)
    .fillGround()
    .wall({ x: 0, y: 0, z: 0 }, "e", "door")
    .build();
  const actor = unitAt("actor", "infantry", { x: 0, y: 0, z: 0 });
  const goal = { id: "objective-1", position: { x: 2, y: 0, z: 0 } };
  const mission = observe(
    {
      ...missionWith(
        {
          ...map,
          tiles: map.tiles.map((tile) =>
            tile.x === 1 && blocked ? { ...tile, pass: 0 } : tile,
          ),
        },
        [actor],
        {
          objectives: [
            {
              id: goal.id,
              kind: "destroy-spawner",
              targetId: "nest",
              complete: false,
            },
          ],
          spawners: [
            {
              id: "nest",
              pos: goal.position,
              hp: 30,
              timer: 2,
              hatchRadius: 3,
              destroyed: false,
            },
          ],
        },
      ),
      jev: { entities: {}, commanders: { tdf: "", bugs: "" } },
    },
    "fog",
  );
  return {
    mission,
    goal,
    graph: buildMoveGraph(mission.map),
    visibility: "fog",
  };
}

describe("real-map navigation evaluation", () => {
  it.each(caseDefinitions("pilot"))(
    "replays an optimal one-AP control on $size using real rules",
    (definition) => {
      const world = buildCase(definition, "full");
      let mission = world.mission;
      let actions = 0;
      while (
        remaining(world, mission.units[0].pos) > 0 &&
        actions <= world.optimalAp
      ) {
        const { candidates } = snapshotOf(mission, world.goal);
        const chosen = [...candidates].sort(
          (a, b) =>
            remaining(world, a.command.payload.path.at(-1)) -
            remaining(world, b.command.payload.path.at(-1)),
        )[0];
        const before = remaining(world, mission.units[0].pos);
        mission = applyMove(world, mission, chosen);
        expect(before - remaining(world, mission.units[0].pos)).toBeGreaterThan(
          0,
        );
        actions++;
      }
      expect(remaining(world, mission.units[0].pos)).toBe(0);
      expect(actions).toBe(world.optimalAp);
    },
  );

  it("keeps every legal tile in lean comparisons and withholds the offline scoring answer", () => {
    const world = buildCase(caseDefinitions("pilot")[0], "full");
    const { snapshot, candidates } = snapshotOf(world.mission, world.goal);
    for (const variant of ["lean-flat", "coordinates", "local", "relative"]) {
      const page = choicePage(variant, snapshot, candidates, {
        ...world.goal,
        distance: 987654321,
      });
      expect(Object.keys(page.request.questions.action.criteria)).toEqual(
        candidates.map((candidate) => candidate.id),
      );
      expect(JSON.stringify(page.request)).not.toContain("987654321");
      expect(JSON.stringify(page.request)).not.toContain(
        "remaining_route_steps",
      );
      expect(page.request.state.navigation?.x_digits).toBeUndefined();
    }
  });

  it("offers both objectives without choosing the ordered objective in application code", () => {
    const world = buildCase(caseDefinitions("pilot")[0], "full");
    const { snapshot, candidates } = snapshotOf(world.mission, world.goal);
    const page = choicePage(
      "goal-route-doors",
      snapshot,
      candidates,
      world.goal,
      {
        mission: world.mission,
        navigationMemory: {},
        rejectedDoors: new Set(),
      },
    );
    expect(Object.keys(page.actions)).toEqual(["objective-1", "objective-2"]);
    expect(page.plans["objective-1"].target).not.toEqual(
      page.plans["objective-2"].target,
    );
    const changed = choicePage(
      "goal-route-doors",
      {
        ...snapshot,
        state: {
          ...snapshot.state,
          entity_prompt: "Reach objective-1 as quickly as possible.",
        },
      },
      candidates,
      world.goal,
      {
        mission: world.mission,
        navigationMemory: {},
        rejectedDoors: new Set(),
      },
    );
    expect(changed.actions).toEqual(page.actions);
    expect(changed.request.questions.action.criteria).toEqual(
      page.request.questions.action.criteria,
    );
    expect(page.request.state).toEqual({
      entity_prompt: snapshot.state.entity_prompt,
      commander_prompt: "",
    });
    expect(page.request.state.navigation).toBeUndefined();
  });

  it("attempts only the first unseen door cell, then reveals terrain through normal vision", () => {
    const world = doorway();
    const { snapshot, candidates } = snapshotOf(world.mission, world.goal);
    expect(candidates).toHaveLength(0);
    const page = choicePage(
      "goal-route-doors",
      snapshot,
      candidates,
      world.goal,
      {
        mission: world.mission,
        navigationMemory: {},
        rejectedDoors: new Set(),
      },
    );
    const candidate = page.actions[world.goal.id];
    expect(candidate.command.payload.path).toEqual([{ x: 1, y: 0, z: 0 }]);
    const moved = applyMove(world, world.mission, candidate);
    expect(moved.units[0].pos).toEqual({ x: 1, y: 0, z: 0 });
    expect(moved.jev.knowledge.tdf.tiles.some((tile) => tile.x === 2)).toBe(
      true,
    );
  });

  it("does not peek at a hidden blocked cell and can exclude a refused door hypothesis", () => {
    const clear = doorway();
    const blocked = doorway(true);
    const pages = [clear, blocked].map((world) => {
      const { snapshot, candidates } = snapshotOf(world.mission, world.goal);
      return choicePage("goal-route-doors", snapshot, candidates, world.goal, {
        mission: world.mission,
        navigationMemory: {},
        rejectedDoors: new Set(),
      });
    });
    expect(pages[0]).toEqual(pages[1]);
    expect(() =>
      applyMove(blocked, blocked.mission, pages[1].actions[blocked.goal.id]),
    ).toThrow("Game refused move");
    const { snapshot, candidates } = snapshotOf(blocked.mission, blocked.goal);
    const rejected = new Set([blocked.graph.index.keyOf({ x: 1, y: 0, z: 0 })]);
    expect(() =>
      choicePage("goal-route-doors", snapshot, candidates, blocked.goal, {
        mission: blocked.mission,
        navigationMemory: {},
        rejectedDoors: rejected,
      }),
    ).toThrow("No known route");
  });
});

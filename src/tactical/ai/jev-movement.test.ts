import { describe, expect, it } from "vitest";
import { jevMovementCandidates } from "./jev-movement";
import { scaleJevMovement, jevDistancePage } from "./jev-distance";
import { captureJev } from "./jev-request";
import { jevPerception } from "./jev-observation";
import {
  missionWith,
  openField,
  unitAt,
  walledField,
  twoFloorBuilding,
  FIXTURE_TEMPLATES,
  ctxWith,
  riggedRng,
} from "../service/tactical-fixtures.test-helper";
import { createMoveHandler } from "../service/move-handler";
import { TileIndex } from "../../mapgen/service/tile-index";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { SHIPPED_EQUIPMENT } from "../repository/equipment-catalogue";
import type { TacticalState } from "../model/tactical-state";
import type { JevCandidate } from "../model/jev-control";

const rules = {
  handlers: {},
  combat: COMBAT_TUNING,
  equipment: { catalogue: SHIPPED_EQUIPMENT, combat: COMBAT_TUNING },
};

/** Expose a fixed test battlefield to both factions without changing its physical rules. */
function revealed(mission: TacticalState): TacticalState {
  const index = new TileIndex(mission.map);
  const visible = mission.map.tiles.map((tile) => index.keyOf(tile));
  const vision = {
    visible,
    explored: visible,
    spotted: mission.units.map((unit) => unit.id),
    lastSeen: {},
  };
  return { ...mission, vision: { tdf: vision, bugs: vision } };
}

/** Execute the selected move through the same validator as gameplay and assert exactly one AP spent. */
function execute(
  mission: TacticalState,
  candidate: JevCandidate,
): TacticalState {
  const command = candidate.command!;
  if (command.type !== "tactical:move") throw new Error("Expected a move");
  const actor = mission.units.find(
    (unit) => unit.id === command.payload.unitId,
  )!;
  const result = createMoveHandler()(
    mission,
    command,
    ctxWith(riggedRng(true)),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  expect(
    result.value.state.units.find((unit) => unit.id === actor.id)!.ap,
  ).toBe(actor.ap - 1);
  return result.value.state;
}

describe("Jev movement intent planning", () => {
  it("routes around walls toward named entities and stops beside their occupied footprint", () => {
    let mission = revealed(
      missionWith(walledField(), [
        unitAt("self", "infantry", { x: 1, y: 0, z: 5 }),
        unitAt("alpha", "infantry", { x: 6, y: 0, z: 5 }),
      ]),
    );
    const visited = [];
    for (let i = 0; i < 8; i++) {
      const candidate = jevMovementCandidates(mission, mission.units[0]!, [], {
        alpha: "Alpha",
      }).find((entry) => entry.id === "move_to_entity:alpha");
      if (!candidate) break;
      expect(candidate.description).toContain("Alpha");
      mission = execute(mission, scaleJevMovement(candidate, 4));
      visited.push(mission.units[0]!.pos);
      mission = {
        ...mission,
        units: mission.units.map((unit) => ({ ...unit, ap: 2 })),
      };
    }
    expect(visited).toHaveLength(4);
    const end = mission.units[0]!.pos;
    expect(Math.abs(end.x - 6) + Math.abs(end.z - 5)).toBe(1);
    expect(end).not.toEqual(mission.units[1]!.pos);
  });
  it("handles elevation connectors and large actors through the real movement validator", () => {
    const elevated = revealed(
      missionWith(twoFloorBuilding(), [
        unitAt("self", "infantry", { x: 5, y: 0, z: 6 }),
        unitAt("alpha", "infantry", { x: 6, y: 2, z: 5 }),
      ]),
    );
    const candidate = jevMovementCandidates(
      elevated,
      elevated.units[0]!,
      [],
      {},
    ).find((entry) => entry.id === "move_to_entity:alpha")!;
    expect(candidate).toBeDefined();
    execute(elevated, scaleJevMovement(candidate, 4));
    const large = revealed(
      missionWith(
        openField().build(),
        [
          {
            ...unitAt(
              "self",
              "infantry",
              { x: 0, y: 0, z: 0 },
              { team: "bugs" },
            ),
            templateId: FIXTURE_TEMPLATES.block,
          },
          unitAt("alpha", "infantry", { x: 6, y: 0, z: 1 }, { team: "bugs" }),
        ],
        { phase: "bugs" },
      ),
    );
    for (const move of jevMovementCandidates(large, large.units[0]!, [], {}))
      execute(large, scaleJevMovement(move, 2));
  });
  it("offers compass extremes and retreats from the closest hostile, retaining that intent when shortened", () => {
    const mission = revealed(
      missionWith(openField().build(), [
        unitAt("self", "infantry", { x: 3, y: 0, z: 3 }),
        unitAt("enemy", "infantry", { x: 2, y: 0, z: 3 }, { team: "bugs" }),
      ]),
    );
    const moves = jevMovementCandidates(mission, mission.units[0]!, [], {});
    const expected = {
      move_north: { x: 3, y: 0, z: 0 },
      move_east: { x: 6, y: 0, z: 3 },
      move_south: { x: 3, y: 0, z: 6 },
    };
    for (const [id, position] of Object.entries(expected)) {
      const result = execute(
        mission,
        scaleJevMovement(
          moves.find((item) => item.id === id)!,
          4,
        ),
      );
      expect(result.units[0]!.pos).toEqual(position);
    }
    const retreat = moves.find((item) => item.id === "move_away_from_enemies")!;
    for (const score of [0, 1, 2, 3, 4]) {
      const result = execute(mission, scaleJevMovement(retreat, score));
      const pos = result.units[0]!.pos;
      expect(Math.abs(pos.x - 2) + Math.abs(pos.z - 3)).toBeGreaterThan(1);
    }
    const alone = { ...mission, units: [mission.units[0]!] };
    expect(
      jevMovementCandidates(alone, alone.units[0]!, [], {}).some(
        (item) => item.id === "move_away_from_enemies",
      ),
    ).toBe(false);
  });
  it("uses only faction knowledge, offers public objectives without leaking fog, and omits completed or unreachable targets", () => {
    const mission = missionWith(walledField(), [
      unitAt("self", "infantry", { x: 1, y: 0, z: 5 }),
      unitAt("hidden", "infantry", { x: 6, y: 0, z: 5 }, { team: "bugs" }),
    ]);
    const index = new TileIndex(mission.map);
    const visible = mission.map.tiles
      .filter((tile) => tile.x <= 2)
      .map((tile) => index.keyOf(tile));
    const observed = {
      ...mission,
      vision: {
        ...mission.vision,
        tdf: { visible, explored: visible, spotted: [], lastSeen: {} },
      },
    };
    const view = jevPerception(observed, observed.units[0]!);
    const goal = {
      id: "objective-1",
      kind: "destroy-spawner",
      complete: false,
      position: { x: 6, y: 0, z: 5 },
    };
    const candidates = jevMovementCandidates(view, view.units[0]!, [goal], {});
    expect(candidates.some((item) => item.id.includes("hidden"))).toBe(false);
    const move = candidates.find(
      (item) => item.id === "move_to_objective:objective-1",
    )!;
    expect(move.movement?.routeKind).toBe("explore-frontier");
    const result = execute(observed, move);
    expect(result.units[0]!.pos.x).toBeLessThanOrEqual(2);
    expect(
      jevMovementCandidates(
        view,
        view.units[0]!,
        [{ ...goal, complete: true }],
        {},
      ).some((item) => item.id.includes("objective")),
    ).toBe(false);
    const isolated = revealed(
      missionWith(walledField(), [
        unitAt("mech", "mech", { x: 1, y: 0, z: 5 }),
        unitAt("friend", "infantry", { x: 6, y: 0, z: 5 }),
      ]),
    );
    expect(
      jevMovementCandidates(isolated, isolated.units[0]!, [], {}).some((item) =>
        item.id.includes("friend"),
      ),
    ).toBe(false);
  });
});

describe("Jev movement distance", () => {
  it("rounds scores up, caps the route and spends one AP even for the minimum", () => {
    const base = revealed(
      missionWith(openField().build(), [
        unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
      ]),
    );
    const id = base.units[0]!.templateId;
    const mission = {
      ...base,
      templates: {
        ...base.templates,
        [id]: { ...base.templates[id]!, move: 5 },
      },
    };
    const snapshot = captureJev(mission, "self", rules);
    const candidate = snapshot.candidates.find(
      (entry) => entry.id === "move_east",
    )!;
    const page = jevDistancePage(snapshot, candidate);
    expect(page.request.state).toMatchObject(snapshot.state);
    expect(page.request.state.selected_movement).toMatchObject({
      available_distance: 5,
      proposed_endpoint: { x: 5, y: 0, z: 0 },
      ap_cost: 1,
    });
    expect(page.request.questions.distance?.criteria).toHaveLength(5);
    for (const [score, expected] of [
      [0, 1],
      [2, 3],
      [3.2, 4],
      [3.21, 5],
      [4, 5],
    ]) {
      const result = execute(mission, scaleJevMovement(candidate, score!));
      expect(result.units[0]!.pos.x).toBe(expected);
    }
    for (const score of [NaN, Infinity, -0.1, 4.1])
      expect(() => scaleJevMovement(candidate, score)).toThrow();
  });
  it("rounds terrain-weighted movement points for slow TDF and fast bugs, not tile counts", () => {
    const map = openField()
      .tile({ x: 1, y: 0, z: 0 }, SurfaceIds.INFESTED)
      .build();
    const tdf = revealed(
      missionWith(map, [unitAt("self", "infantry", { x: 0, y: 0, z: 0 })]),
    );
    const move = jevMovementCandidates(tdf, tdf.units[0]!, [], {}).find(
      (item) => item.id === "move_east",
    )!;
    expect(move.movement?.stops.map((stop) => stop.cost)).toEqual([2, 3]);
    expect(execute(tdf, scaleJevMovement(move, 2.5)).units[0]!.pos.x).toBe(1);
    const bugs = revealed(
      missionWith(
        map,
        [unitAt("self", "infantry", { x: 0, y: 0, z: 0 }, { team: "bugs" })],
        { phase: "bugs" },
      ),
    );
    const bugMove = jevMovementCandidates(bugs, bugs.units[0]!, [], {}).find(
      (item) => item.id === "move_east",
    )!;
    expect(bugMove.movement?.stops.map((stop) => stop.cost)).toEqual([
      0.5, 1.5, 2.5,
    ]);
    expect(execute(bugs, scaleJevMovement(bugMove, 1)).units[0]!.pos.x).toBe(2);
  });
});

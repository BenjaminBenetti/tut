import { describe, expect, it } from "vitest";
import { jevMovementCandidates } from "./jev-movement";
import { scaleJevMovement, jevDistancePage } from "./jev-distance";
import { captureJev, jevChoicePage } from "./jev-request";
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
import { createExtractHandler } from "../service/objective-service";
import { OBJECTIVE_TUNING } from "../data/objective-tuning";
import { TileIndex } from "../../mapgen/service/tile-index";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { PassMask } from "../../mapgen/model/pass-mask";
import { buildMoveGraph } from "../service/movement-service";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { DEFAULT_MISSION_HOOKS } from "../../mapgen/data/hook-requirements";
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
  it("routes into a reachable extraction tile, then offers and executes extraction at its real AP cost", () => {
    let mission = revealed({
      ...missionWith(openField().build(), [
        unitAt("self", "infantry", { x: 1, y: 0, z: 1 }),
        unitAt("blocking-ally", "infantry", { x: 2, y: 0, z: 1 }),
      ]),
      extraction: [
        { x: 2, y: 0, z: 1 },
        { x: 3, y: 0, z: 1 },
      ],
    });
    const extract = createExtractHandler(OBJECTIVE_TUNING);
    const extractionRules = {
      ...rules,
      handlers: { "tactical:extract": extract },
    };
    // The nearest extraction tile is occupied; choose the next reachable one.
    for (let step = 0; step < 3; step++) {
      const snapshot = captureJev(mission, "self", extractionRules);
      const target = snapshot.candidates.find(
        (candidate) => candidate.id === "move_to_extraction",
      );
      if (!target) break;
      expect(target.movement).toMatchObject({
        targetName: "Extraction zone",
        targetPosition: { x: 3, y: 0, z: 1 },
      });
      expect(
        jevChoicePage(
          snapshot,
          snapshot.candidates.filter((candidate) => candidate.movement),
        ).request.questions.action!.criteria,
      ).toHaveProperty("move_to_extraction");
      mission = execute(mission, scaleJevMovement(target, 4));
      if (mission.units[0]!.ap === 0)
        mission = {
          ...mission,
          units: mission.units.map((unit) => ({ ...unit, ap: 2 })),
        };
    }
    expect(mission.units[0]!.pos).toEqual({ x: 3, y: 0, z: 1 });
    const arrived = captureJev(mission, "self", extractionRules);
    expect(
      arrived.candidates.some(
        (candidate) => candidate.id === "move_to_extraction",
      ),
    ).toBe(false);
    const candidate = arrived.candidates.find(
      (entry) => entry.category === "extract",
    )!;
    expect(candidate).toMatchObject({
      apCost: OBJECTIVE_TUNING.extractApCost,
      endsActivation: true,
    });
    if (candidate.command?.type !== "tactical:extract")
      throw new Error("Expected extraction");
    const result = extract(
      mission,
      candidate.command,
      ctxWith(riggedRng(true)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected successful extraction");
    expect(result.value.state.units.some((unit) => unit.id === "self")).toBe(
      false,
    );
    expect(result.value.state.extracted[0]?.id).toBe("self");
  });
  it("does not invent an extraction move when every zone tile is blocked", () => {
    const mission = revealed({
      ...missionWith(openField().build(), [
        unitAt("self", "infantry", { x: 1, y: 0, z: 1 }),
        unitAt("ally", "infantry", { x: 2, y: 0, z: 1 }),
      ]),
      extraction: [{ x: 2, y: 0, z: 1 }],
    });
    expect(
      captureJev(mission, "self", rules).candidates.some(
        (entry) => entry.id === "move_to_extraction",
      ),
    ).toBe(false);
  });
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
  it.each([
    ["tdf", 0, 4],
    ["tdf", 4, 0],
    ["bugs", 0, 4],
    ["bugs", 4, 0],
  ] as const)(
    "routes %s from layer %i to %i using stairs outside faction vision",
    (team, startY, targetY) => {
      const builder = new FixtureMapBuilder(6, 2, 5)
        .fillGround()
        .fillGround(2, SurfaceIds.FLOOR)
        .fillGround(4, SurfaceIds.FLOOR);
      builder.connector("stairs", { x: 4, y: 0, z: 0 }, { x: 4, y: 2, z: 1 });
      builder.connector("stairs", { x: 1, y: 2, z: 1 }, { x: 1, y: 4, z: 0 });
      const map = builder.build();
      let mission = missionWith(
        map,
        [
          unitAt("self", "infantry", { x: 0, y: startY, z: 0 }, { team }),
          unitAt("alpha", "infantry", { x: 0, y: targetY, z: 0 }, { team }),
        ],
        { phase: team === "tdf" ? "player" : "bugs" },
      );
      const layers = new Set<number>([startY]);
      for (let i = 0; i < 8; i++) {
        const visible = [new TileIndex(map).keyOf(mission.units[0]!.pos)];
        mission = {
          ...mission,
          units: mission.units.map((unit) => ({ ...unit, ap: 2 })),
          vision: {
            ...mission.vision,
            [team]: { visible, explored: visible, spotted: [], lastSeen: {} },
          },
        };
        const candidate = captureJev(mission, "self", rules).candidates.find(
          (entry) => entry.id === "move_to_entity:alpha",
        );
        if (!candidate) break;
        const command = candidate.command!;
        if (command.type !== "tactical:move")
          throw new Error("Expected a move");
        for (const pos of command.payload.path) layers.add(pos.y);
        mission = execute(mission, scaleJevMovement(candidate, 4));
      }
      const end = mission.units[0]!.pos;
      expect(end.y).toBe(targetY);
      expect(end.x + end.z).toBe(1);
      expect([...layers].sort()).toEqual([0, 2, 4]);
    },
  );
  it("uses another staircase when the target occupies a landing instead of arriving on the wrong floor", () => {
    const original = twoFloorBuilding();
    const map = {
      ...original,
      connectors: [
        ...original.connectors,
        {
          ...original.connectors[0]!,
          id: "second-stairs",
          from: { x: 6, y: 0, z: 6 },
          to: { x: 6, y: 2, z: 5 },
        },
      ],
    };
    const mission = revealed(
      missionWith(map, [
        unitAt("self", "infantry", { x: 5, y: 0, z: 6 }),
        unitAt("alpha", "infantry", { x: 5, y: 2, z: 5 }),
      ]),
    );
    const candidate = captureJev(mission, "self", rules).candidates.find(
      (entry) => entry.id === "move_to_entity:alpha",
    );
    expect(candidate).toBeDefined();
    expect(execute(mission, candidate!).units[0]!.pos).toEqual({
      x: 6,
      y: 2,
      z: 5,
    });
  });
  it("reaches another floor in a generated city building with no explored terrain", () => {
    const map = generateTacticalMap({
      seed: "730982385",
      params: {
        archetype: "settlement",
        biome: "temperate",
        settlement: "city",
        size: "small",
        hooks: DEFAULT_MISSION_HOOKS,
      },
    });
    const building = map.buildings.find((entry) => entry.floors.length >= 3)!;
    expect(building).toBeDefined();
    const stairs = map.connectors
      .filter(
        (link) => link.buildingId === building.id && link.kind === "stairs",
      )
      .sort((a, b) => b.to.y - a.to.y);
    const graph = buildMoveGraph(map);
    const landing = graph.index.getAt(stairs[0]!.to)!;
    const target = [
      ...graph.reachability.neighbours(landing, PassMask.INFANTRY),
    ].find((tile) => tile.y === landing.y && tile.buildingId === building.id)!;
    expect(target).toBeDefined();
    const upper = { x: target.x, y: target.y, z: target.z };
    const lower = building.entrances[0]!.tile;
    for (const [start, goal] of [
      [lower, upper],
      [upper, lower],
    ] as const) {
      let mission = missionWith(map, [
        unitAt("self", "infantry", start),
        unitAt("alpha", "infantry", goal),
      ]);
      const vision = mission.vision;
      for (let i = 0; i < 32; i++) {
        const candidate = captureJev(mission, "self", rules).candidates.find(
          (entry) => entry.id === "move_to_entity:alpha",
        );
        if (!candidate) break;
        mission = execute(mission, scaleJevMovement(candidate, 4));
        mission = {
          ...mission,
          units: mission.units.map((unit) => ({ ...unit, ap: 2 })),
          vision,
        };
      }
      const end = mission.units[0]!.pos;
      expect(end.y).toBe(goal.y);
      expect(Math.abs(end.x - goal.x) + Math.abs(end.z - goal.z)).toBe(1);
    }
  });
  it("still treats a natural half-height step as adjacent to the target", () => {
    const map = openField()
      .removeTile({ x: 1, y: 0, z: 0 })
      .tile({ x: 1, y: 1, z: 0 }, SurfaceIds.GRASS)
      .build();
    const mission = revealed(
      missionWith(map, [
        unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
        unitAt("alpha", "infantry", { x: 1, y: 1, z: 0 }),
      ]),
    );
    expect(
      captureJev(mission, "self", rules).candidates.some(
        (entry) => entry.id === "move_to_entity:alpha",
      ),
    ).toBe(false);
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
  it("routes toward public objectives through fog without using hidden entity positions", () => {
    const mission = missionWith(
      walledField(),
      [
        unitAt("self", "infantry", { x: 1, y: 0, z: 5 }),
        unitAt("hidden", "infantry", { x: 7, y: 0, z: 7 }, { team: "bugs" }),
      ],
      {
        objectives: [
          {
            id: "objective-1",
            kind: "destroy-spawner",
            targetId: "nest",
            complete: false,
          },
        ],
        spawners: [
          {
            id: "nest",
            pos: { x: 6, y: 0, z: 5 },
            hp: 20,
            timer: 2,
            hatchRadius: 3,
            destroyed: false,
          },
        ],
      },
    );
    const index = new TileIndex(mission.map);
    const visible = mission.map.tiles
      .filter((tile) => tile.x <= 2)
      .map((tile) => index.keyOf(tile));
    let observed = {
      ...mission,
      vision: {
        ...mission.vision,
        tdf: { visible, explored: visible, spotted: [], lastSeen: {} },
      },
    };
    for (let i = 0; i < 2; i++) {
      const candidates = captureJev(observed, "self", rules).candidates;
      expect(candidates.some((item) => item.id.includes("hidden"))).toBe(false);
      const move = candidates.find(
        (item) => item.id === "move_to_objective:objective-1",
      )!;
      expect(move.movement?.routeKind).toBe("known-route");
      observed = { ...execute(observed, move), vision: observed.vision };
    }
    expect(observed.units[0]!.pos.x).toBeGreaterThan(3);
    expect(visible).not.toContain(index.keyOf(observed.units[0]!.pos));
    expect(
      captureJev(
        {
          ...mission,
          objectives: mission.objectives.map((goal) => ({
            ...goal,
            complete: true,
          })),
        },
        "self",
        rules,
      ).candidates.some((item) => item.id.includes("objective")),
    ).toBe(false);
  });
  it("omits unreachable targets instead of walking to a fog boundary", () => {
    const isolated = missionWith(walledField(), [
      unitAt("mech", "mech", { x: 1, y: 0, z: 5 }),
      unitAt("friend", "infantry", { x: 6, y: 0, z: 5 }),
    ]);
    expect(
      captureJev(isolated, "mech", rules).candidates.some((item) =>
        item.id.includes("friend"),
      ),
    ).toBe(false);
    const blockedLanding = missionWith(twoFloorBuilding(), [
      unitAt("self", "infantry", { x: 5, y: 0, z: 6 }),
      unitAt("friend", "infantry", { x: 5, y: 2, z: 5 }),
    ]);
    expect(
      captureJev(blockedLanding, "self", rules).candidates.some((item) =>
        item.id.includes("friend"),
      ),
    ).toBe(false);
  });
  it("does not route around or reveal an unseen enemy; execution still validates real occupancy", () => {
    const mission = missionWith(openField().build(), [
      unitAt("self", "infantry", { x: 0, y: 0, z: 0 }),
      unitAt("alpha", "infantry", { x: 6, y: 0, z: 0 }),
    ]);
    const before = captureJev(mission, "self", rules);
    const blocked = {
      ...mission,
      units: [
        ...mission.units,
        unitAt("hidden", "infantry", { x: 1, y: 0, z: 0 }, { team: "bugs" }),
      ],
    };
    expect(captureJev(blocked, "self", rules)).toEqual(before);
    const candidate = before.candidates.find(
      (item) => item.id === "move_to_entity:alpha",
    )!;
    const command = candidate.command!;
    if (command.type !== "tactical:move") throw new Error("Expected a move");
    expect(
      createMoveHandler()(blocked, command, ctxWith(riggedRng(true))).ok,
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

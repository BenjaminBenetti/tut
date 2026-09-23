import assert from "node:assert/strict";
import { generateTacticalMap } from "../../src/mapgen/service/generate-tactical-map.ts";
import { squadUnit } from "../../src/tactical/service/unit-factory.ts";
import { UNIT_TUNING } from "../../src/tactical/data/unit-tuning.ts";
import { RIFLE_SQUAD } from "../../src/roster/data/squad-types.ts";
import { SequentialIdGenerator } from "../../src/core/service/sequential-id-generator.ts";
import { Mulberry32Rng } from "../../src/core/service/mulberry32-rng.ts";
import { missionWith } from "../../src/tactical/service/tactical-fixtures.test-helper.ts";
import {
  buildMoveGraph,
  searchMoves,
  movementStepCost,
} from "../../src/tactical/service/movement-service.ts";
import { withVision } from "../../src/tactical/service/vision-service.ts";
import { rememberJevTerrain } from "../../src/tactical/service/jev-knowledge-service.ts";
import { createMoveHandler } from "../../src/tactical/service/move-handler.ts";
import { COMBAT_TUNING } from "../../src/tactical/data/combat-tuning.ts";
import { SHIPPED_EQUIPMENT } from "../../src/tactical/repository/equipment-catalogue.ts";
import { gridKey } from "../../src/core/service/grid-math.ts";

export const RULES = {
  handlers: {},
  combat: COMBAT_TUNING,
  equipment: { catalogue: SHIPPED_EQUIPMENT, combat: COMBAT_TUNING },
};
const MOVE = createMoveHandler();

/** Fixed development seeds and separate held-out seeds, at every shipped map size. */
export function caseDefinitions(suite) {
  const seeds =
    suite === "holdout"
      ? ["jev-navigation-holdout-1", "jev-navigation-holdout-2"]
      : suite === "pilot"
        ? ["730982385"]
        : ["730982385", "3677615265"];
  return seeds.flatMap((seed, i) =>
    ["small", "medium", "large"].map((size) => ({
      id: `${suite}-${String(i + 1)}-${size}`,
      seed,
      size,
      biome: i ? "coastal" : "temperate",
      settlement: i ? "town" : "city",
    })),
  );
}

/** Use the real generator, deployment hook, objective hooks and shipped rookie rifle squad. */
export function buildCase(definition, visibility) {
  const map = generateTacticalMap({
    seed: definition.seed,
    params: {
      archetype: "settlement",
      biome: definition.biome,
      settlement: definition.settlement,
      size: definition.size,
      infestation: 0,
      hooks: [
        { kind: "deploy", count: 1, requiredPass: 3 },
        {
          kind: "egg-spawner",
          count: 2,
          requiredPass: 1,
          minDistanceFromDeploy: 12,
          maxNearestDistanceFromDeploy: 30,
          meta: { hatchRadius: 3 },
        },
        { kind: "edge-spawn", count: 2, requiredPass: 1 },
        { kind: "extraction", count: 1, requiredPass: 3 },
      ],
    },
  });
  const graph = buildMoveGraph(map);
  const start = map.hooks.deployZones[0].tiles.find((pos) =>
    graph.reachability.canOccupy(graph.index.getAt(pos), 1),
  );
  assert(start, "Generated deployment must have an infantry tile");
  const made = squadUnit(
    {
      id: "alpha",
      name: "Alpha",
      typeId: "rifle",
      strength: 5,
      maxStrength: 5,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    },
    RIFLE_SQUAD,
    { pos: start, facing: "n" },
    { ids: new SequentialIdGenerator(), tuning: UNIT_TUNING },
  );
  const spawners = map.hooks.objectives
    .filter((hook) => hook.kind === "egg-spawner")
    .map((hook, i) => ({
      id: `nest-${String(i + 1)}`,
      pos: hook.tiles[0],
      hp: 30,
      hatchRadius: 3,
      timer: 2,
      destroyed: false,
    }));
  let mission = {
    ...missionWith(map, [made.unit], {
      spawners,
      objectives: spawners.map((nest, i) => ({
        id: `objective-${String(i + 1)}`,
        kind: "destroy-spawner",
        targetId: nest.id,
        complete: false,
      })),
    }),
    templates: { [made.template.id]: made.template },
    jev: { entities: {}, commanders: { tdf: "", bugs: "" } },
    extraction: map.hooks.extraction.tiles,
  };
  const fromStart = searchMoves(
    mission,
    { ...made.unit, ap: map.tiles.length },
    graph,
  );
  const choices = mission.objectives
    .map((objective) => {
      const position = spawners.find(
        (nest) => nest.id === objective.targetId,
      ).pos;
      return {
        id: objective.id,
        position,
        distance: fromStart.costs.get(graph.index.keyOf(position)),
      };
    })
    .filter((goal) => Number.isFinite(goal.distance));
  assert.equal(
    choices.length,
    spawners.length,
    "Every generated objective must be reachable",
  );
  const goal = choices.sort((a, b) => b.distance - a.distance)[0];
  // With ordinary uninfested infantry all steps cost one, so ceil(distance / move) is exact AP ground truth.
  for (const tile of fromStart.tiles.values())
    assert.equal(movementStepCost(mission, made.unit, tile, graph), 1);
  const oracle = searchMoves(
    mission,
    { ...made.unit, pos: goal.position, ap: map.tiles.length },
    graph,
  ).costs;
  assert.equal(oracle.get(graph.index.keyOf(start)), goal.distance);
  const optimalAp = Math.ceil(goal.distance / made.template.move);
  mission = observe(mission, visibility);
  return {
    definition,
    visibility,
    mission,
    graph,
    goal,
    oracle,
    optimalAp,
    movement: made.template.move,
    start,
    metadata: {
      ...definition,
      visibility,
      dimensions: [map.width, map.depth, map.levels],
      start,
      goal,
      movement: made.template.move,
      optimalAp,
      terrainTiles: map.tiles.length,
    },
  };
}

/** Full terrain knowledge is an isolation control; fog uses actual faction LOS and persistent memory. */
export function observe(mission, visibility) {
  const state =
    visibility === "full"
      ? {
          ...mission,
          vision: {
            ...mission.vision,
            tdf: {
              ...mission.vision.tdf,
              visible: mission.map.tiles.map((tile) =>
                gridKey(tile, mission.map.width, mission.map.depth),
              ),
              explored: mission.map.tiles.map((tile) =>
                gridKey(tile, mission.map.width, mission.map.depth),
              ),
              spotted: mission.units
                .filter((unit) => unit.team !== "tdf" && unit.hp > 0)
                .map((unit) => unit.id),
            },
          },
        }
      : withVision({ state: mission, events: [] }).state;
  return rememberJevTerrain(state);
}

/** Apply the real move handler; only AP refresh and enemy-free turn progression are harness shortcuts. */
export function applyMove(world, mission, candidate) {
  assert.equal(candidate.command?.type, "tactical:move");
  const before = mission.units[0];
  const result = MOVE(mission, candidate.command, {
    ids: new SequentialIdGenerator(),
    rng: new Mulberry32Rng(1),
  });
  if (!result.ok)
    throw Object.assign(
      new Error(`Game refused move: ${JSON.stringify(result.error)}`),
      { gameError: result.error },
    );
  assert.equal(
    before.ap - result.value.state.units[0].ap,
    1,
    "Every evaluated move must spend exactly one AP",
  );
  let next = { ...result.value.state, commandSeq: mission.commandSeq + 1 };
  if (!next.units[0].ap)
    next = {
      ...next,
      turn: next.turn + 1,
      units: next.units.map((unit, index) =>
        index === 0 ? { ...unit, ap: unit.maxAp } : unit,
      ),
    };
  return observe(next, world.visibility);
}

/** Offline scoring only; never attach this full-map answer key to model state. */
export function remaining(world, pos) {
  return world.oracle.get(world.graph.index.keyOf(pos)) ?? Infinity;
}

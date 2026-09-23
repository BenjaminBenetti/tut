import assert from "node:assert/strict";
import { jevPerception } from "../../src/tactical/ai/jev-observation.ts";
import {
  buildMoveGraph,
  searchMoves,
} from "../../src/tactical/service/movement-service.ts";
import { knownRoute } from "./navigation-routes.mjs";
import { approachTiles } from "./navigation-entities.mjs";

const STATIC_FIELDS = [
  "type",
  "kind",
  "movement_class",
  "max_hp",
  "armor",
  "footprint",
  "weapons",
  "equipment",
  "max_ap",
  "movement",
  "systems",
];
const INSTRUCTIONS =
  "Which entity should actor move toward to follow commander_prompt and entity_prompt? Commander orders override conflicting individual orders. Match names and metadata in entities; capability_ref refers to shared capabilities when present. HP means current health. equipment_remaining counts unused items. Choose one offered entity. The game finds a legal route to an unoccupied tile adjacent to it. Moving spends 1 AP, then you choose again with updated actor state. Other entities remain still during this navigation evaluation.";

/** Keep all observed metadata and all 100 choices, optionally sharing repeated static capability facts. */
export function entityChoicePage(variant, snapshot, context) {
  const entities = context.entityOrder.map((id) =>
    snapshot.state.entities.find((entity) => entity.id === id),
  );
  assert.equal(entities.length, 100);
  assert(
    entities.every(Boolean),
    "All 100 candidates must be observed entities",
  );
  const state = {
    entity_prompt: snapshot.state.entity_prompt,
    commander_prompt: snapshot.state.commander_prompt,
    actor: snapshot.state.actor,
    entities,
  };
  if (variant === "entities-shared")
    Object.assign(state, sharedCapabilities(entities));
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const criteria = Object.fromEntries(
    context.choiceOrder.map((id) => [id, `Move toward ${byId.get(id).name}.`]),
  );
  return {
    stage: "movement-entity",
    request: {
      model: "jev-1.13.0",
      state,
      questions: {
        action: { type: "choice", instructions: INSTRUCTIONS, criteria },
      },
    },
  };
}

/** Losslessly factor repeated type/capability fields; per-entity identity, condition and resources remain inline. */
export function sharedCapabilities(entities) {
  const capabilities = {};
  const keys = new Map();
  const records = entities.map((entity) => {
    const capability = Object.fromEntries(
      STATIC_FIELDS.filter((key) => Object.hasOwn(entity, key)).map((key) => [
        key,
        entity[key],
      ]),
    );
    const signature = JSON.stringify(capability);
    if (!keys.has(signature)) {
      const id = `capability-${keys.size + 1}`;
      keys.set(signature, id);
      capabilities[id] = capability;
    }
    return {
      ...Object.fromEntries(
        Object.entries(entity).filter(([key]) => !STATIC_FIELDS.includes(key)),
      ),
      capability_ref: keys.get(signature),
    };
  });
  return { entities: records, capabilities };
}

/** Plan only after Jev selects an entity, using the game graph with the full physical crowd present. */
export function moveTowardEntity(mission, targetId, movement) {
  const actor = mission.units[0];
  const view = jevPerception(mission, actor);
  const target = view.units.find((unit) => unit.id === targetId);
  assert(target, "Selected entity must be in faction perception");
  const graph = buildMoveGraph(view.map);
  const search = searchMoves(
    view,
    { ...actor, ap: view.map.tiles.length },
    graph,
  );
  const approaches = approachTiles(view, target, graph)
    .filter((pos) => search.costs.has(graph.index.keyOf(pos)))
    .sort(
      (a, b) =>
        search.costs.get(graph.index.keyOf(a)) -
          search.costs.get(graph.index.keyOf(b)) ||
        graph.index.keyOf(a) - graph.index.keyOf(b),
    );
  assert(approaches.length, "Chosen entity has no reachable approach");
  if (search.costs.get(graph.index.keyOf(approaches[0])) === 0)
    return { arrived: true };
  const plan = knownRoute(view, actor, approaches[0], graph, search, {
    exhausted: new Set(),
  });
  assert(plan);
  const path = plan.path.filter(
    (pos) => search.costs.get(graph.index.keyOf(pos)) <= movement,
  );
  assert(path.length);
  return {
    plan: { ...plan, entityId: targetId },
    candidate: {
      id: `approach-${targetId}`,
      category: "move",
      apCost: 1,
      command: { type: "tactical:move", payload: { unitId: actor.id, path } },
    },
  };
}

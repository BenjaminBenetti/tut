import { captureJev as captureGame } from "../../src/tactical/ai/jev-request.ts";
import { jevPerception } from "../../src/tactical/ai/jev-observation.ts";
import { jevNavigation } from "../../src/tactical/ai/jev-map.ts";
import {
  buildMoveGraph,
  searchMoves,
  apCostOf,
} from "../../src/tactical/service/movement-service.ts";
import { coverAgainst } from "../../src/tactical/service/sight-service.ts";

/** Preserve the earlier evaluation formats after gameplay switches to intent-based movement. This adapter is never shipped. */
export function captureJev(mission, unitId, rules, prompts, names) {
  const snapshot = captureGame(mission, unitId, rules, prompts, names);
  const actor = mission.units.find((unit) => unit.id === unitId);
  const view = jevPerception(mission, actor);
  /** Recreate the historical inline metadata, including its omission of uninitialized resource pools. */
  const inline = ({ capability_ref, ...entity }) => {
    const result = {
      ...snapshot.state.capabilities[capability_ref],
      ...entity,
    };
    const unit = view.units.find((unit) => unit.id === entity.id);
    if (unit?.team === actor.team) {
      result.charges = unit.charges;
      result.equipment_remaining = unit.equipment;
    }
    return result;
  };
  const state = {
    ...snapshot.state,
    actor: inline(snapshot.state.actor),
    entities: snapshot.state.entities.map(inline),
    navigation: jevNavigation(
      view,
      actor,
      snapshot.state.objectives.flatMap((objective) =>
        !objective.complete && objective.position
          ? [{ symbol: "O", id: objective.id, position: objective.position }]
          : [],
      ),
    ),
  };
  delete state.capabilities;
  delete state.equipment_definitions;
  const candidates = [];
  if (snapshot.eligible && actor.kind !== "turret") {
    const graph = buildMoveGraph(view.map);
    const search = searchMoves(view, { ...actor, ap: 1 }, graph);
    const origin = graph.index.keyOf(actor.pos);
    for (const [key, cost] of search.costs) {
      if (key === origin || apCostOf(view, actor, cost) !== 1) continue;
      const path = [];
      for (
        let cursor = key;
        cursor !== origin;
        cursor = search.parents.get(cursor)
      ) {
        const tile = search.tiles.get(cursor);
        path.unshift({ x: tile.x, y: tile.y, z: tile.z });
      }
      const tile = search.tiles.get(key);
      candidates.push({
        id: `action-${candidates.length}`,
        category: "move",
        apCost: 1,
        command: { type: "tactical:move", payload: { unitId, path } },
        description: JSON.stringify({
          action: "move",
          destination: { x: tile.x, y: tile.y, z: tile.z },
          ap_cost: 1,
          movement_points: cost,
          path_steps: path.length,
          cover: [
            ["n", 0, -1],
            ["e", 1, 0],
            ["s", 0, 1],
            ["w", -1, 0],
          ].map(([direction, dx, dz]) => [
            direction,
            coverAgainst(
              view.map,
              tile,
              { x: tile.x + dx, y: tile.y, z: tile.z + dz },
              graph.index,
            ),
          ]),
          known_hazards: view.effects.filter(
            (effect) => graph.index.keyOf(effect.tile) === key,
          ),
        }),
      });
    }
  }
  return JSON.parse(JSON.stringify({ ...snapshot, state, candidates }));
}

import { jevChoicePage } from "../../src/tactical/ai/jev-request.ts";
import { jevPerception } from "../../src/tactical/ai/jev-observation.ts";
import {
  buildMoveGraph,
  searchMoves,
} from "../../src/tactical/service/movement-service.ts";
import { localMap } from "./navigation-local-map.mjs";
import { goalRoutePage } from "./navigation-routes.mjs";
import { entityChoicePage } from "./navigation-entity-choice.mjs";

export const VARIANTS = [
  "current",
  "lean-state",
  "lean-flat",
  "coordinates",
  "local",
  "relative",
  "route-cost",
  "goal-route",
  "goal-route-doors",
  "entities-inline",
  "entities-shared",
];
const INSTRUCTIONS =
  "Move the actor to the objective using the fewest movement actions. Every offered destination is reachable and costs 1 AP, including short moves; unused movement range is lost. After moving you choose again from the new position. Account for obstacles and detours. Select only an offered choice.";

/** Remove combat, equipment, duplicate prose, identities unrelated to this single-actor movement task. */
function leanState(snapshot, goal, map = true) {
  const nav = snapshot.state.navigation;
  return {
    order: snapshot.state.entity_prompt,
    actor: snapshot.state.actor.position,
    objective: { id: goal.id, ...goal.position },
    movement_points_per_action: snapshot.state.actor.movement,
    ...(map
      ? {
          navigation: {
            width: nav.width,
            depth: nav.depth,
            coordinates: nav.coordinates,
            legend: nav.legend,
            wall_rules: nav.wall_rules,
            feature_rules: nav.feature_rules,
            elevation_rules: nav.elevation_rules,
            layers: nav.layers,
            connectors: nav.connectors,
          },
        }
      : {}),
  };
}

/** Compare tile-input reductions with explicitly separate engine-assisted route and goal controls. */
export function choicePage(variant, snapshot, candidates, goal, context) {
  if (variant.startsWith("entities-"))
    return entityChoicePage(variant, snapshot, context);
  if (variant === "goal-route")
    return goalRoutePage(snapshot, candidates, context);
  if (variant === "goal-route-doors")
    return goalRoutePage(snapshot, candidates, context, true);
  if (variant === "current") return jevChoicePage(snapshot, candidates);
  if (variant === "lean-state") {
    const page = jevChoicePage(snapshot, candidates);
    const stage = page.groups
      ? "Choose a destination group; a follow-up selects the tile within it."
      : "Choose the destination tile.";
    return {
      ...page,
      request: {
        ...page.request,
        state: leanState(snapshot, goal),
        questions: {
          action: {
            ...page.request.questions.action,
            instructions: `${INSTRUCTIONS} ${stage}`,
          },
        },
      },
    };
  }
  if (candidates.length > 255)
    throw new Error(
      "Flat control exceeds TypeSafe's 255 choices; do not silently prune candidates",
    );
  let state = leanState(snapshot, goal, variant === "lean-flat");
  let instructions = INSTRUCTIONS;
  let route, graph;
  const actor = snapshot.state.actor.position;
  if (variant === "local") state.navigation = localMap(snapshot, goal);
  if (variant === "relative")
    state = {
      order: state.order,
      objective_relative_to_actor: {
        east: goal.position.x - actor.x,
        up: goal.position.y - actor.y,
        south: goal.position.z - actor.z,
      },
      movement_points_per_action: state.movement_points_per_action,
    };
  if (variant === "route-cost") {
    // Assisted control: calculate routes on faction knowledge, never the scoring oracle.
    const view = jevPerception(context.mission, context.mission.units[0]);
    graph = buildMoveGraph(view.map);
    route = searchMoves(
      view,
      { ...view.units[0], pos: goal.position, ap: view.map.tiles.length },
      graph,
    ).costs;
    if (!route.has(graph.index.keyOf(actor)))
      throw new Error(
        "Goal is outside the connected known map; route-cost requires a known route",
      );
    instructions =
      "Every option costs 1 AP. Choose the destination with the fewest remaining route steps to the objective. The game computed these distances along walkable routes, including detours.";
  }
  return {
    stage: "action",
    request: {
      model: "jev-1.13.0",
      state,
      questions: {
        action: {
          type: "choice",
          instructions,
          criteria: Object.fromEntries(
            candidates.map((candidate) => {
              const details = JSON.parse(candidate.description);
              const destination = details.destination;
              return [
                candidate.id,
                {
                  ...(variant === "relative"
                    ? {
                        east: destination.x - actor.x,
                        up: destination.y - actor.y,
                        south: destination.z - actor.z,
                      }
                    : { destination }),
                  movement_points: details.movement_points,
                  ...(route
                    ? {
                        remaining_route_steps:
                          route.get(graph.index.keyOf(destination)) ?? null,
                      }
                    : {}),
                },
              ];
            }),
          ),
        },
      },
    },
  };
}

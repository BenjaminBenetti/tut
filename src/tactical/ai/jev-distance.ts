import JEV_PROTOCOL from "../data/jev-protocol.json";
import type { JevCandidate, JevSnapshot } from "../model/jev-control";
import type { JevChoicePage } from "./jev-request";

/** Follow destination selection with the same full metadata plus the proposed one-AP move. */
export function jevDistancePage(
  snapshot: JevSnapshot,
  candidate: JevCandidate,
): JevChoicePage {
  const movement = candidate.movement;
  const command = candidate.command;
  if (!movement || command?.type !== "tactical:move" || !movement.stops.length)
    throw new Error("Selected movement has no legal route");
  return {
    stage: "movement-distance",
    movement: candidate,
    request: {
      model: JEV_PROTOCOL.model,
      state: {
        ...snapshot.state,
        selected_movement: {
          intent: movement.intent,
          target_id: movement.targetId,
          target_name: movement.targetName,
          target_position: movement.targetPosition,
          route_kind: movement.routeKind,
          extract_on_arrival_with_last_ap: movement.extractOnArrival === true,
          available_distance: movement.stops.at(-1)!.cost,
          distance_unit: "terrain-weighted movement points",
          ap_cost: 1,
          proposed_endpoint: command.payload.path.at(-1),
          proposed_path: command.payload.path,
        },
      },
      questions: {
        distance: {
          type: "score",
          instructions: JEV_PROTOCOL.distanceInstructions,
          criteria: JEV_PROTOCOL.distanceLevels,
        },
      },
    },
  };
}

/** Round up by actual terrain cost to a legal prefix, preserving direction or retreat progress. */
export function scaleJevMovement(
  candidate: JevCandidate,
  score: number,
): JevCandidate {
  if (!Number.isFinite(score) || score < 0 || score > 4)
    throw new Error("Invalid Jev movement distance score");
  return stopAlong(candidate, score / 4, score);
}

/**
 * The whole one-AP route of a movement that asks no distance question
 * (`JevMovement.fullRoute`, #1179): the map edge exit. The model's
 * distance answers are nearly always "full" or "minimal", and their
 * probability-weighted mean lands near "half", so a fleeing actor asked
 * the question ran about 55 % of its movement (bug 4).
 *
 * ```
 *   move_to_map_edge ──► jevFullMovement ──► the full one-AP path
 *   any other move   ──► jevDistancePage ──► score ──► scaleJevMovement
 * ```
 *
 * @param candidate - A movement candidate marked `fullRoute`.
 * @returns It with its full one-AP path and a description of the stop.
 */
export function jevFullMovement(candidate: JevCandidate): JevCandidate {
  if (candidate.movement?.fullRoute !== true)
    throw new Error("Selected movement needs a distance answer");
  return stopAlong(candidate, 1);
}

/**
 * Cut a movement candidate's route at the first legal stop whose terrain
 * cost reaches `fraction` of the full one-AP cost, and describe it.
 *
 * @param candidate - The movement candidate.
 * @param fraction - Share of the route's cost to cover, 0 to 1.
 * @param score - The distance answer it came from; absent for a full route.
 * @returns The candidate with its cut path and a description.
 */
function stopAlong(
  candidate: JevCandidate,
  fraction: number,
  score?: number,
): JevCandidate {
  const movement = candidate.movement;
  const command = candidate.command;
  if (!movement || command?.type !== "tactical:move" || !movement.stops.length)
    throw new Error("Selected movement has no legal route");
  const full = movement.stops.at(-1)!;
  const stop =
    movement.stops.find((item) => item.cost >= full.cost * fraction) ?? full;
  const path = command.payload.path.slice(0, stop.steps);
  return {
    ...candidate,
    command: { ...command, payload: { ...command.payload, path } },
    description: JSON.stringify({
      intent: movement.intent,
      target_id: movement.targetId,
      target_name: movement.targetName,
      ...(score === undefined ? { full_route: true } : { score }),
      distance_fraction: fraction,
      available_distance: full.cost,
      movement_points: stop.cost,
      path_steps: path.length,
      destination: path.at(-1),
      ap_cost: 1,
      rounding:
        score === undefined
          ? "none: the full route, with no distance question"
          : "up to next legal stopping point",
    }),
  };
}

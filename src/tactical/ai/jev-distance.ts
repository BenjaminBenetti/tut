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
  const movement = candidate.movement;
  const command = candidate.command;
  if (!movement || command?.type !== "tactical:move" || !movement.stops.length)
    throw new Error("Selected movement has no legal route");
  const full = movement.stops.at(-1)!;
  const fraction = score / 4;
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
      score,
      distance_fraction: fraction,
      available_distance: full.cost,
      movement_points: stop.cost,
      path_steps: path.length,
      destination: path.at(-1),
      ap_cost: 1,
      rounding: "up to next legal stopping point",
    }),
  };
}

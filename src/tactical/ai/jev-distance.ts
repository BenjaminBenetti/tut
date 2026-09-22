import type { JevCandidate, JevSnapshot } from "../model/jev-control";
import type { JevChoicePage } from "./jev-request";

/** Five ordered movement levels, mapped by the game to a normalized extent. */
const DISTANCE_LEVELS = [
  "Minimal movement: take only the smallest legal step along the selected route.",
  "Short movement: use about one quarter of the available distance along the selected route.",
  "Half movement: use about half of the available distance along the selected route.",
  "Mostly full movement: use about three quarters of the available distance along the selected route.",
  "Full movement: use all available distance along the selected route.",
] as const;

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
      model: "jev-latest",
      state: {
        ...snapshot.state,
        selected_movement: {
          intent: movement.intent,
          target_id: movement.targetId,
          target_name: movement.targetName,
          target_position: movement.targetPosition,
          route_kind: movement.routeKind,
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
          instructions:
            "How much of the available movement should the actor use to follow its orders? Follow commander_prompt over conflicting entity_prompt; otherwise use faction_goal. The movement destination has already been selected in selected_movement. Consider all actor and entity metadata; capability_ref points to shared capabilities. Rate the desired movement extent using the ordered levels. Any move costs exactly 1 AP, even a short move; unused movement points are lost. A shorter move does not preserve AP. The game divides the score by 4, scales the proposed route's movement-point cost, and rounds up to the next legal nonzero stopping point that still follows the selected intent, capped at the proposed endpoint. A fresh state and decision follow this move while AP remains. Arrival alone does not attack or complete an objective.",
          criteria: DISTANCE_LEVELS,
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

import { TileIndex } from "../../mapgen/service/tile-index";
import type { ObjectiveMarker } from "../model/objective-marker";
import type { ObjectiveRulesTable } from "../model/objective-rules";
import type { TacticalState } from "../model/tactical-state";
import type { Team } from "../model/unit";
import {
  OBJECTIVE_RULES,
  objectiveRulesFor,
} from "./objectives/objective-rules";

// ===========================================
// Objective markers
// ===========================================

/**
 * White location blips for the primary objectives `team` cannot see
 * this instant (#1173): every open objective whose kind marks a tile
 * (ADR 0013 §2.3) that lies outside `visible`. Finding the eggs used
 * to mean walking onto them or carrying a radar in; the objective is
 * the mission, so its whereabouts are never withheld.
 *
 * ```
 *   objective open, kind marks a tile (a spawner: its nest, while it stands)
 *     tile visible     ──► no marker   (the target's model is drawn)
 *     tile in the fog  ──► marker      (explored or not)
 *   objective complete or failed, or nothing to mark ──► no marker
 * ```
 *
 * A generator is a unit of ours, lit from the first turn (#1175), so a
 * defence marks nothing. A rescue (campaign arc §6.4) marks every group
 * still trapped, one blip each, through its kind's `markers`, and is
 * blipped past its flags while a group waits (`workedUntilEmpty`).
 * Location only: like a radar contact it discloses neither health nor
 * hatch timer, and it never changes vision, explored ground or what a
 * behaviour may know.
 *
 * @param mission - The mission whose objectives are marked.
 * @param team - The side looking. The objectives are the player's (GDD §6.3), so the bugs get none.
 * @param rules - The objective rules; the shipped table unless a test substitutes it.
 * @returns One marker per fogged, open objective, in objective order.
 */
export function objectiveMarkers(
  mission: TacticalState,
  team: Team,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): readonly ObjectiveMarker[] {
  if (team !== "tdf") return [];
  const open = mission.objectives.filter(
    (objective) =>
      objectiveRulesFor(objective, rules).workedUntilEmpty === true ||
      (!objective.complete && objective.failed !== true),
  );
  if (open.length === 0) return [];
  const index = new TileIndex(mission.map);
  const visible = new Set(mission.vision[team]?.visible ?? []);
  const markers: ObjectiveMarker[] = [];
  for (const objective of open) {
    const kind = objectiveRulesFor(objective, rules);
    const single = kind.markers ? undefined : kind.marker?.(objective, mission);
    const places =
      kind.markers?.(objective, mission) ??
      (single === undefined ? [] : [single]);
    for (const pos of places) {
      if (visible.has(index.keyOf(pos))) {
        continue;
      }
      markers.push({ objectiveId: objective.id, pos });
    }
  }
  return markers;
}

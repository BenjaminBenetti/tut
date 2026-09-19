import { TileIndex } from "../../mapgen/service/tile-index";
import type { ObjectiveMarker } from "../model/objective-marker";
import type { TacticalState } from "../model/tactical-state";
import type { Team } from "../model/unit";

// ===========================================
// Objective markers
// ===========================================

/**
 * White location blips for the primary objectives `team` cannot see
 * this instant (#1173): every open `destroy-spawner` objective whose
 * nest still stands on a tile outside `visible`. Finding the eggs used
 * to mean walking onto them or carrying a radar in; the objective is
 * the mission, so its whereabouts are never withheld.
 *
 * ```
 *   objective open, nest standing
 *     tile visible     ──► no marker   (the spawner model is drawn)
 *     tile in the fog  ──► marker      (explored or not)
 *   objective complete or nest destroyed ──► no marker
 * ```
 *
 * Location only: like a radar contact it discloses neither health nor
 * hatch timer, and it never changes vision, explored ground or what a
 * behaviour may know.
 *
 * @param mission - The mission whose objectives are marked.
 * @param team - The side looking. The objectives are the player's (GDD §6.3), so the bugs get none.
 * @returns One marker per fogged, open objective, in objective order.
 */
export function objectiveMarkers(
  mission: TacticalState,
  team: Team,
): readonly ObjectiveMarker[] {
  if (team !== "tdf") return [];
  const open = mission.objectives.filter((objective) => !objective.complete);
  if (open.length === 0) return [];
  const index = new TileIndex(mission.map);
  const visible = new Set(mission.vision[team]?.visible ?? []);
  const spawners = new Map(mission.spawners.map((s) => [s.id, s]));
  const markers: ObjectiveMarker[] = [];
  for (const objective of open) {
    // A generator is a unit of ours, lit from the first turn (#1175);
    // only a spawner hides in the fog and needs the blip.
    if (objective.kind !== "destroy-spawner") {
      continue;
    }
    const spawner = spawners.get(objective.targetId);
    if (
      spawner === undefined ||
      spawner.destroyed ||
      spawner.hp <= 0 ||
      visible.has(index.keyOf(spawner.pos))
    ) {
      continue;
    }
    markers.push({ objectiveId: objective.id, pos: spawner.pos });
  }
  return markers;
}

import { TileIndex } from "../../mapgen/service/tile-index";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { RadarContact } from "../model/radar";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { radarContacts } from "../service/radar-service";

/** Public mission destination, without hidden target condition. */
export interface JevObjective {
  readonly id: string;
  readonly kind: string;
  readonly complete: boolean;
  readonly position?: TileCoord;
  /** Defence targets are also exposed as entity destinations when known to the faction. */
  readonly target_ids?: readonly string[];
  readonly failed?: boolean;
}

/** The same destination sources feed observation and the exhaustive movement provider registry. */
export interface JevDestinationSources {
  readonly entities: readonly Unit[];
  readonly objectives: readonly JevObjective[];
  readonly extraction: readonly TileCoord[];
  readonly visible_carcasses: TacticalState["carcasses"];
  readonly radar_contacts: readonly RadarContact[];
  readonly last_seen: readonly {
    readonly id: string;
    readonly position: TileCoord;
    readonly knowledge: string;
  }[];
}

/** Project only shared faction intel; cleared historical locations are no longer investigation goals. */
export function jevDestinations(
  mission: TacticalState,
  view: TacticalState,
  actor: Unit,
): JevDestinationSources {
  const vision = mission.vision[actor.team];
  const index = new TileIndex(mission.map);
  const visible = new Set(vision.visible);
  return {
    entities: view.units,
    objectives: jevObjectives(mission),
    extraction: mission.extraction,
    visible_carcasses: view.carcasses,
    radar_contacts: radarContacts(mission, actor.team),
    last_seen: Object.entries(vision.lastSeen)
      .filter(
        ([id, position]) =>
          !vision.spotted.includes(id) && !visible.has(index.keyOf(position)),
      )
      .map(([id, position]) => ({
        id,
        position,
        knowledge:
          "Historical sighting; current location, health and survival unknown",
      })),
  };
}

/** Objective locations are public intel; unobserved nest health is not. */
export function jevObjectives(mission: TacticalState): readonly JevObjective[] {
  return mission.objectives.map((objective): JevObjective => {
    const common = {
      id: objective.id,
      kind: objective.kind,
      complete: objective.complete,
    };
    switch (objective.kind) {
      case "destroy-spawner":
        return {
          ...common,
          position: mission.spawners.find(
            (nest) => nest.id === objective.targetId,
          )?.pos,
        };
      case "defend-generators":
        return {
          ...common,
          target_ids: objective.targetIds,
          failed: objective.failed,
        };
    }
  });
}

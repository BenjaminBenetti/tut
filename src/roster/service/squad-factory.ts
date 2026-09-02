import type { Squad, SquadId } from "../model/squad";
import { SQUAD_MAX_STRENGTH } from "../model/squad";
import type { SquadType } from "../model/squad-type";

/**
 * Builds a freshly hired squad of the given type at full strength with
 * no history. The caller supplies the id (from core's `IdGenerator`) and
 * the player-facing name; this function does no validation or charging,
 * which belong to the roster service.
 */
export function createSquad(type: SquadType, id: SquadId, name: string): Squad {
  return {
    id,
    name,
    typeId: type.id,
    strength: SQUAD_MAX_STRENGTH,
    maxStrength: SQUAD_MAX_STRENGTH,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

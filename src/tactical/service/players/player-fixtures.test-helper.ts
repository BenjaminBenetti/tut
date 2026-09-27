import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../../data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import type { TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { SHIPPED_EQUIPMENT } from "../../repository/equipment-catalogue";
import type { MissionOptions } from "../tactical-fixtures.test-helper";
import { missionWith, openField } from "../tactical-fixtures.test-helper";
import { initialVision } from "../vision-service";
import type { PlayerRules } from "./player-combat.test-helper";

// ===========================================
// Fixtures for the modelled players (#1179)
// ===========================================

/** The shipped rules, as the calibration matrix hands them to a player. */
export const FIXTURE_PLAYER_RULES: PlayerRules = {
  catalogue: SHIPPED_EQUIPMENT,
  combat: COMBAT_TUNING,
  objective: OBJECTIVE_TUNING,
};

/** The drop ship of the open field: its south-west corner. */
export const FIXTURE_EXTRACTION: readonly TileCoord[] = [{ x: 0, y: 0, z: 0 }];

/**
 * A mission on the map (the open 8×8 field unless told otherwise) with
 * the units, the drop ship in the south-west corner, and both sides'
 * first look taken, so a player sees what the fog would let it see.
 */
export function lookingMission(
  units: readonly Unit[],
  options: MissionOptions = {},
  map: TacticalMap = openField().build(),
): TacticalState {
  const mission = {
    ...missionWith(map, units, options),
    extraction: FIXTURE_EXTRACTION,
  };
  return { ...mission, vision: initialVision(mission) };
}

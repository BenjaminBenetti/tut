import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import { createDefaultRegistries } from "../../../mapgen/service/default-registries";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../../data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import { TUNNEL_TUNING } from "../../data/tunnel-tuning";
import type {
  SealTunnelsObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { TunnelMouth } from "../../model/tunnel-mouth";
import type { Unit } from "../../model/unit";
import { SHIPPED_EQUIPMENT } from "../../repository/equipment-catalogue";
import type { MissionOptions } from "../tactical-fixtures.test-helper";
import { missionWith, openField } from "../tactical-fixtures.test-helper";
import { registryStructureCatalogue } from "../structure-catalogue";
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
  structures: registryStructureCatalogue(createDefaultRegistries()),
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

/** The seal-tunnels objective of `tunnelMission`, over its mouths. */
export function sealObjective(
  mouths: readonly TunnelMouth[],
): SealTunnelsObjective {
  return {
    id: "seal",
    kind: "seal-tunnels",
    mouthIds: mouths.map((mouth) => mouth.id),
    complete: false,
  };
}

/** How a fixture mouth stands: open, burning (going off on a turn), pulled or sealed. */
export type FixtureMouthState =
  | { readonly state: "open" }
  | { readonly state: "burning"; readonly goesOffOn: number }
  | { readonly state: "pulled" }
  | { readonly state: "sealed" };

/**
 * A Tunnel Sabotage on `map`: one-tile mouths at the given tiles in the
 * given states, a burning one's charge on its tile as Interact sets it,
 * and the objective over them all.
 */
export function tunnelMission(
  units: readonly Unit[],
  mouths: readonly (FixtureMouthState & {
    readonly id: string;
    readonly pos: TileCoord;
  })[],
  map?: TacticalMap,
): TacticalState {
  const placed: TunnelMouth[] = mouths.map((mouth) => ({
    id: mouth.id,
    pos: mouth.pos,
    tiles: [mouth.pos],
    ...(mouth.state === "burning"
      ? {
          chargeId: `${mouth.id}-charge`,
          chargeHitsLeft: TUNNEL_TUNING.meleeHitsToDisarm,
        }
      : {}),
    ...(mouth.state === "pulled" ? { chargesPulled: 1 } : {}),
    ...(mouth.state === "sealed"
      ? { chargeId: `${mouth.id}-charge`, sealedOnTurn: 1 }
      : {}),
  }));
  return {
    ...lookingMission(units, { objectives: [sealObjective(placed)] }, map),
    tunnelMouths: placed,
    charges: mouths.flatMap((mouth) =>
      mouth.state === "burning"
        ? [
            {
              id: `${mouth.id}-charge`,
              ownerId: units[0]?.id ?? "alpha",
              equipmentId: TUNNEL_TUNING.chargeEquipmentId,
              tile: mouth.pos,
              detonatesOnTurn: mouth.goesOffOn,
            },
          ]
        : [],
    ),
  };
}

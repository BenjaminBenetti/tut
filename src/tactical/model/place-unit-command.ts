import type { Command } from "../../core/model/command";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { MissionId } from "../../overworld/model/mission";
import type { UnitKind } from "./unit";

// ===========================================
// PlaceUnit
// ===========================================

/**
 * Command type for the development tools' unit placement (#1136): put a
 * unit of a catalogue type on a tile of the live mission, outside any
 * rule of the game. Refused outside a dev build; see
 * `place-unit-handler`.
 */
export const PLACE_UNIT = "tactical:place-unit";

/**
 * A type of unit the debug menu can place, by the id its catalogue knows
 * it by: a bug species (`"swarmer"`), a squad type (`"rifle"`) or a
 * debug mech source (`"starter"`).
 */
export interface PlaceableUnit {
  readonly kind: UnitKind;
  readonly id: string;
  /** What the menu calls it: the species or squad type name, or "Mech (starter)". */
  readonly name: string;
}

/** Which mission, what to place, and where. */
export interface PlaceUnitPayload {
  /** The mission the placement is meant for; a stale one is refused rather than applied to whatever is live. */
  readonly missionId: MissionId;
  readonly kind: UnitKind;
  /** The catalogue id of the kind: species, squad type or debug mech source. */
  readonly id: string;
  /** The anchor tile; a brute's block extends `+x` and `+z` from it. */
  readonly tile: TileCoord;
}

/** Put a catalogue unit on a tile, for testing (#1136). */
export type PlaceUnitCommand = Command<typeof PLACE_UNIT, PlaceUnitPayload>;

/** Builds the command for the armed menu entry and the clicked tile. */
export function placeUnit(
  missionId: MissionId,
  kind: UnitKind,
  id: string,
  tile: TileCoord,
): PlaceUnitCommand {
  return { type: PLACE_UNIT, payload: { missionId, kind, id, tile } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [PLACE_UNIT]: PlaceUnitCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [PLACE_UNIT]: PlaceUnitCommand;
  }
}

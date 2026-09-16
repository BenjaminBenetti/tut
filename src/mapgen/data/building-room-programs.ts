import type { BuildingRoomProgram } from "../model/building-room-program";
import type { KnownBuildingKindId } from "./building-kind-ids";
import { RoomKindIds as Room } from "./room-kind-ids";

/** Room uses by building and storey; geometry and furnishing stay separate. */
export const BUILDING_ROOM_PROGRAMS: Readonly<
  Record<
    KnownBuildingKindId,
    {
      readonly ground: BuildingRoomProgram;
      readonly upper: BuildingRoomProgram;
    }
  >
> = {
  house: {
    ground: {
      arrival: Room.LIVING_ROOM,
      primary: [Room.BEDROOM, Room.KITCHEN],
      repeat: [Room.BEDROOM, Room.KITCHEN],
      compact: { kind: Room.BATHROOM, minRooms: 4 },
    },
    upper: {
      arrival: Room.BEDROOM,
      primary: [Room.BATHROOM, Room.BEDROOM],
      repeat: [Room.BEDROOM, Room.OFFICE],
    },
  },
  apartment: {
    ground: {
      arrival: Room.LIVING_ROOM,
      primary: [Room.BEDROOM, Room.KITCHEN],
      repeat: [Room.BEDROOM, Room.LIVING_ROOM, Room.KITCHEN],
      compact: { kind: Room.BATHROOM, minRooms: 4 },
    },
    upper: {
      arrival: Room.LIVING_ROOM,
      primary: [Room.BEDROOM, Room.KITCHEN],
      repeat: [Room.BEDROOM, Room.LIVING_ROOM, Room.KITCHEN],
      compact: { kind: Room.BATHROOM, minRooms: 4 },
    },
  },
  shop: {
    ground: {
      arrival: Room.RETAIL,
      primary: [Room.STORAGE, Room.RETAIL],
      repeat: [Room.RETAIL, Room.STORAGE],
    },
    upper: {
      arrival: Room.OFFICE,
      primary: [Room.STORAGE, Room.BREAK_ROOM],
      repeat: [Room.STORAGE, Room.OFFICE],
    },
  },
  warehouse: {
    ground: {
      arrival: Room.STORAGE,
      primary: [Room.WORKSHOP, Room.STORAGE],
      repeat: [Room.STORAGE],
      compact: { kind: Room.OFFICE, minRooms: 4 },
    },
    upper: {
      arrival: Room.STORAGE,
      primary: [Room.WORKSHOP],
      repeat: [Room.STORAGE],
    },
  },
  tower: {
    ground: {
      arrival: Room.RECEPTION,
      primary: [Room.OFFICE, Room.MEETING, Room.BREAK_ROOM],
      repeat: [Room.OFFICE, Room.OFFICE, Room.MEETING],
    },
    upper: {
      arrival: Room.OFFICE,
      primary: [Room.MEETING, Room.BREAK_ROOM, Room.OFFICE],
      repeat: [Room.OFFICE, Room.OFFICE, Room.MEETING],
    },
  },
};

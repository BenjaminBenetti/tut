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
      roomSlots: { kitchen: Room.KITCHEN, bedroom: Room.BEDROOM },
      primary: [Room.BEDROOM, Room.KITCHEN],
      repeat: [Room.BEDROOM, Room.OFFICE],
      compact: { kind: Room.BATHROOM, minRooms: 4 },
    },
    upper: {
      arrival: Room.BEDROOM,
      roomSlots: { kitchen: Room.BEDROOM, bedroom: Room.BEDROOM },
      primary: [Room.BATHROOM, Room.BEDROOM],
      repeat: [Room.BEDROOM, Room.OFFICE],
    },
  },
  apartment: {
    ground: {
      arrival: Room.LIVING_ROOM,
      roomSlots: { kitchen: Room.KITCHEN, bedroom: Room.BEDROOM },
      primary: [Room.BEDROOM, Room.KITCHEN],
      repeat: [Room.BEDROOM, Room.LIVING_ROOM, Room.KITCHEN],
      compact: { kind: Room.BATHROOM, minRooms: 4 },
    },
    upper: {
      arrival: Room.LIVING_ROOM,
      roomSlots: { kitchen: Room.KITCHEN, bedroom: Room.BEDROOM },
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
      roomSlots: { workfloor: Room.OFFICE },
      primary: [Room.OFFICE, Room.MEETING, Room.BREAK_ROOM],
      repeat: [Room.OFFICE, Room.OFFICE, Room.MEETING],
    },
    upper: {
      arrival: Room.OFFICE,
      roomSlots: { workfloor: Room.OFFICE },
      primary: [Room.MEETING, Room.BREAK_ROOM, Room.OFFICE],
      repeat: [Room.OFFICE, Room.OFFICE, Room.MEETING],
    },
  },
  "sensor-array": {
    ground: {
      arrival: Room.RECEPTION,
      roomSlots: { workfloor: Room.CONTROL_ROOM },
      primary: [Room.CONTROL_ROOM, Room.WORKSHOP, Room.BREAK_ROOM],
      repeat: [Room.OFFICE],
    },
    upper: {
      arrival: Room.CONTROL_ROOM,
      roomSlots: { workfloor: Room.CONTROL_ROOM },
      primary: [Room.MEETING, Room.OFFICE],
      repeat: [Room.OFFICE],
    },
  },
  "repellent-dispersal": {
    ground: {
      arrival: Room.PUMP_ROOM,
      primary: [Room.CONTROL_ROOM, Room.WORKSHOP],
      repeat: [Room.STORAGE],
    },
    upper: {
      arrival: Room.PUMP_ROOM,
      primary: [Room.WORKSHOP],
      repeat: [Room.STORAGE],
    },
  },
  "defensive-battery": {
    ground: {
      arrival: Room.ARMORY,
      primary: [Room.CONTROL_ROOM, Room.WORKSHOP],
      repeat: [Room.STORAGE],
    },
    upper: {
      arrival: Room.ARMORY,
      primary: [Room.CONTROL_ROOM],
      repeat: [Room.STORAGE],
    },
  },
  bank: {
    ground: {
      arrival: Room.BANKING_HALL,
      primary: [Room.VAULT, Room.OFFICE],
      repeat: [Room.VAULT],
    },
    upper: {
      arrival: Room.OFFICE,
      primary: [Room.MEETING, Room.BREAK_ROOM],
      repeat: [Room.OFFICE],
    },
  },
};

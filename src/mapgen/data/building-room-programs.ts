import type { BuildingRoomProgram } from "../model/building-room-program";
import type { KnownBuildingKindId } from "./building-kind-ids";
import { RoomKindIds as Room } from "./room-kind-ids";

/** The programme the four installations share (#1175). */
const INSTALLATION_PROGRAM = {
  ground: {
    arrival: Room.WORKSHOP,
    primary: [Room.OFFICE, Room.STORAGE],
    repeat: [Room.STORAGE],
  },
  upper: {
    arrival: Room.STORAGE,
    primary: [Room.WORKSHOP],
    repeat: [Room.STORAGE],
  },
} as const;

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
  // Installations (#1175): a workshop keeps the plant running, storage feeds it.
  "sensor-array": INSTALLATION_PROGRAM,
  "repellent-dispersal": INSTALLATION_PROGRAM,
  "defensive-battery": INSTALLATION_PROGRAM,
  bank: INSTALLATION_PROGRAM,
};

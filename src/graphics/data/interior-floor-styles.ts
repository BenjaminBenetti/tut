import type {
  InteriorFloorFinish,
  InteriorFloorStyle,
} from "../model/interior-floor-style";

/** Environment timber, stone and muted greens keep gameplay overlays distinct. */
export const INTERIOR_FLOOR_STYLES: Readonly<
  Record<InteriorFloorFinish, InteriorFloorStyle>
> = {
  timber: { colours: [0x8b7050, 0x967b5b], seam: 0x68543e, roughness: 0.88 },
  carpet: { colours: [0x65746a, 0x727b80], seam: 0x59665e, roughness: 1 },
  ceramic: { colours: [0xc3beb0, 0xb7c0bc], seam: 0x96988d, roughness: 0.72 },
  concrete: { colours: [0x8e8a82, 0x96928a], seam: 0x7d7a72, roughness: 1 },
};

/** Legacy room kinds retain sensible finishes when an older mission is resumed. */
export const ROOM_FLOOR_FINISHES: Readonly<
  Record<string, InteriorFloorFinish>
> = {
  hall: "ceramic",
  room: "timber",
  storage: "concrete",
  corridor: "ceramic",
  retail: "ceramic",
  grocery: "ceramic",
  "bakery-cafe": "timber",
  pharmacy: "ceramic",
  clothing: "carpet",
  electronics: "ceramic",
  hardware: "concrete",
  bookshop: "timber",
  office: "carpet",
  reception: "ceramic",
  meeting: "carpet",
  "break-room": "ceramic",
  "living-room": "timber",
  bedroom: "timber",
  kitchen: "ceramic",
  bathroom: "ceramic",
  workshop: "concrete",
  "control-room": "carpet",
  "pump-room": "concrete",
  armory: "concrete",
  "banking-hall": "ceramic",
  vault: "concrete",
};

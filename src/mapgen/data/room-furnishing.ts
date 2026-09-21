import type {
  FurnishingGroup,
  RoomArrangement,
  RoomFurnishing,
} from "../model/room-furnishing";
import { PropKindIds as Prop } from "./props";
import type { KnownRoomKindId } from "./room-kind-ids";

// ===========================================
// Room furnishing
// ===========================================

/**
 * Recognisable rooms with functional pieces first, accents last. A tile
 * represents two metres: a desk includes its chair, a dining table its
 * seats. Shelf runs share an orientation and have a full tile aisle in
 * front. Small rooms keep their purpose without inheriting a large room's
 * clutter; circulation is protected by the furnishing pass.
 */
export const ROOM_FURNISHING: Readonly<
  Record<KnownRoomKindId, RoomFurnishing>
> = {
  grocery: furnishing("grocery", 4, 16, [
    [
      {
        props: [Prop.PRODUCE_BIN],
        zone: "aisle",
        fallbackZone: "wall",
        count: 2,
      },
      { props: [Prop.CHILLED_DISPLAY], zone: "wall", count: 2 },
      { props: [Prop.CHECKOUT], zone: "counter", rearAccess: true, count: 1 },
      { props: [Prop.RETAIL_SHELF], zone: "aisle", count: 6 },
      { props: [Prop.PRODUCE_BIN], zone: "wall", count: 3 },
    ],
    [
      { props: [Prop.CHILLED_DISPLAY], zone: "wall", count: 3 },
      {
        props: [Prop.PRODUCE_BIN],
        zone: "aisle",
        fallbackZone: "wall",
        count: 2,
      },
      { props: [Prop.CHECKOUT], zone: "counter", rearAccess: true, count: 1 },
      { props: [Prop.RETAIL_SHELF], zone: "wall", count: 5 },
      { props: [Prop.PRODUCE_BIN], zone: "aisle", count: 3 },
    ],
  ]),
  "bakery-cafe": furnishing("bakery-cafe", 5, 12, [
    [
      { props: [Prop.COFFEE_COUNTER], zone: "wall", count: 1 },
      {
        props: [Prop.BAKERY_CASE],
        zone: "counter",
        rearAccess: true,
        count: 1,
      },
      {
        props: [Prop.CAFE_TABLE],
        zone: "center",
        fallbackZone: "wall",
        count: 5,
        spacing: 2,
      },
      { props: [Prop.SOFA], zone: "wall", count: 2 },
      { props: [Prop.PLANTER], zone: "corner", count: 2 },
    ],
    [
      { props: [Prop.BAKERY_CASE], zone: "wall", count: 2 },
      { props: [Prop.COFFEE_COUNTER], zone: "wall", count: 1 },
      {
        props: [Prop.CAFE_TABLE],
        zone: "aisle",
        fallbackZone: "wall",
        count: 5,
        spacing: 2,
      },
      { props: [Prop.PLANTER], zone: "corner", count: 2 },
    ],
  ]),
  pharmacy: furnishing("pharmacy", 4, 12, [
    [
      { props: [Prop.PHARMACY_SHELF], zone: "wall", count: 3 },
      { props: [Prop.CHECKOUT], zone: "counter", rearAccess: true, count: 1 },
      { props: [Prop.PHARMACY_SHELF], zone: "aisle", count: 4 },
      { props: [Prop.REFRIGERATOR], zone: "wall", count: 1 },
      { props: [Prop.SOFA], zone: "wall", count: 1 },
    ],
  ]),
  clothing: furnishing("clothing", 5, 12, [
    [
      {
        props: [Prop.CLOTHING_RACK],
        zone: "aisle",
        fallbackZone: "wall",
        count: 3,
        spacing: 2,
      },
      { props: [Prop.CHECKOUT], zone: "counter", rearAccess: true, count: 1 },
      { props: [Prop.CLOTHING_RACK], zone: "wall", count: 4 },
      { props: [Prop.SOFA], zone: "wall", count: 1 },
      { props: [Prop.PLANTER], zone: "corner", count: 2 },
    ],
  ]),
  electronics: furnishing("electronics", 5, 12, [
    [
      {
        props: [Prop.ELECTRONICS_DISPLAY],
        zone: "aisle",
        fallbackZone: "wall",
        count: 3,
        spacing: 2,
      },
      { props: [Prop.CHECKOUT], zone: "counter", rearAccess: true, count: 1 },
      { props: [Prop.ELECTRONICS_DISPLAY], zone: "wall", count: 4 },
      { props: [Prop.RETAIL_SHELF], zone: "wall", count: 2 },
    ],
  ]),
  hardware: furnishing("hardware", 4, 16, [
    [
      { props: [Prop.HARDWARE_SHELF], zone: "wall", count: 3 },
      { props: [Prop.WORKBENCH], zone: "wall", count: 1 },
      { props: [Prop.CHECKOUT], zone: "counter", rearAccess: true, count: 1 },
      { props: [Prop.HARDWARE_SHELF], zone: "aisle", count: 6 },
      { props: [Prop.CRATE], zone: "wall", count: 3 },
    ],
  ]),
  bookshop: furnishing("bookshop", 4, 14, [
    [
      { props: [Prop.BOOKCASE], zone: "wall", count: 3 },
      { props: [Prop.CHECKOUT], zone: "counter", rearAccess: true, count: 1 },
      {
        props: [Prop.CAFE_TABLE],
        zone: "center",
        fallbackZone: "wall",
        count: 1,
      },
      { props: [Prop.BOOKCASE], zone: "aisle", count: 5 },
      { props: [Prop.SOFA], zone: "wall", count: 2 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
  ]),
  hall: furnishing("hall", 8, 3, [
    [
      { props: [Prop.SOFA], zone: "wall", count: 1 },
      { props: [Prop.PLANTER], zone: "corner", count: 2 },
    ],
  ]),
  room: furnishing("room", 5, 5, [
    [
      { props: [Prop.DESK_COMPUTER], zone: "wall", count: 1 },
      { props: [Prop.BOOKCASE], zone: "wall", count: 1 },
      { props: [Prop.SOFA], zone: "wall", count: 1 },
    ],
  ]),
  corridor: {
    ...furnishing("corridor", 12, 2, [
      [{ props: [Prop.PLANTER], zone: "corner", count: 2 }],
    ]),
    minimumRoomWidth: 2,
  },
  retail: furnishing("retail", 4, 12, [
    [
      { props: [Prop.CHECKOUT], zone: "counter", rearAccess: true, count: 1 },
      { props: [Prop.RETAIL_SHELF], zone: "aisle", count: 8 },
      { props: [Prop.RETAIL_SHELF], zone: "wall", count: 5 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
    [
      { props: [Prop.CHECKOUT], zone: "counter", rearAccess: true, count: 1 },
      { props: [Prop.RETAIL_SHELF], zone: "wall", count: 5 },
      { props: [Prop.RETAIL_SHELF], zone: "aisle", count: 6 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
  ]),
  storage: furnishing("storage", 4, 16, [
    [
      { props: [Prop.SHELVING], zone: "aisle", count: 9 },
      { props: [Prop.CRATE], zone: "wall", count: 4 },
      { props: [Prop.SHELVING], zone: "wall", count: 4 },
    ],
    [
      { props: [Prop.SHELVING], zone: "wall", count: 6 },
      { props: [Prop.CRATE], zone: "aisle", count: 8 },
      { props: [Prop.WORKBENCH], zone: "wall", count: 1 },
    ],
  ]),
  office: furnishing("office", 4, 12, [
    [
      { props: [Prop.DESK_COMPUTER], zone: "wall", count: 6, spacing: 2 },
      { props: [Prop.FILING_CABINET], zone: "wall", count: 2 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
    [
      { props: [Prop.DESK_COMPUTER], zone: "aisle", count: 4, spacing: 2 },
      { props: [Prop.DESK_COMPUTER], zone: "wall", count: 1 },
      { props: [Prop.FILING_CABINET], zone: "wall", count: 2 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
  ]),
  reception: furnishing("reception", 5, 5, [
    [
      { props: [Prop.DESK_COMPUTER], zone: "wall", count: 1 },
      { props: [Prop.SOFA], zone: "wall", count: 2 },
      { props: [Prop.PLANTER], zone: "corner", count: 2 },
    ],
  ]),
  meeting: furnishing("meeting", 5, 5, [
    [
      {
        props: [Prop.MEETING_TABLE],
        zone: "center",
        fallbackZone: "wall",
        count: 1,
      },
      { props: [Prop.FILING_CABINET], zone: "wall", count: 2 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
  ]),
  "break-room": furnishing("break-room", 5, 5, [
    [
      { props: [Prop.KITCHEN_COUNTER], zone: "wall", count: 1 },
      {
        props: [Prop.DINING_TABLE],
        zone: "center",
        fallbackZone: "wall",
        count: 1,
      },
      { props: [Prop.SOFA], zone: "wall", count: 1 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
  ]),
  "living-room": furnishing("living-room", 5, 5, [
    [
      { props: [Prop.SOFA], zone: "wall", count: 1 },
      {
        props: [Prop.DINING_TABLE],
        zone: "center",
        fallbackZone: "wall",
        count: 1,
      },
      { props: [Prop.BOOKCASE], zone: "wall", count: 1 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
    [
      { props: [Prop.SOFA], zone: "wall", count: 2 },
      { props: [Prop.TABLE], zone: "center", fallbackZone: "wall", count: 1 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
  ]),
  bedroom: furnishing("bedroom", 4, 5, [
    [
      { props: [Prop.BED], zone: "wall", count: 1 },
      { props: [Prop.WARDROBE], zone: "wall", count: 1 },
      { props: [Prop.DESK_COMPUTER], zone: "wall", count: 1 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
    [
      { props: [Prop.BED], zone: "wall", count: 1 },
      { props: [Prop.WARDROBE], zone: "corner", count: 1 },
      { props: [Prop.DESK_COMPUTER], zone: "wall", count: 1 },
    ],
  ]),
  kitchen: furnishing("kitchen", 3, 6, [
    [
      { props: [Prop.KITCHEN_COUNTER], zone: "wall", count: 1 },
      { props: [Prop.REFRIGERATOR], zone: "wall", count: 1 },
      {
        props: [Prop.DINING_TABLE],
        zone: "center",
        fallbackZone: "wall",
        count: 1,
      },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
  ]),
  bathroom: furnishing("bathroom", 3, 3, [
    [
      { props: [Prop.BATHROOM_VANITY], zone: "wall", count: 1 },
      { props: [Prop.TOILET], zone: "wall", count: 1 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
  ]),
  "control-room": furnishing("control-room", 4, 14, [
    [
      { props: [Prop.DESK_COMPUTER], zone: "aisle", count: 6, spacing: 2 },
      { props: [Prop.ELECTRONICS_DISPLAY], zone: "wall", count: 4 },
      { props: [Prop.FILING_CABINET], zone: "wall", count: 2 },
    ],
  ]),
  "pump-room": furnishing("pump-room", 4, 12, [
    [
      { props: [Prop.PUMP_UNIT], zone: "aisle", count: 6, spacing: 2 },
      { props: [Prop.WORKBENCH], zone: "wall", count: 2 },
      { props: [Prop.HARDWARE_SHELF], zone: "wall", count: 3 },
    ],
  ]),
  armory: furnishing("armory", 4, 14, [
    [
      { props: [Prop.HARDWARE_SHELF], zone: "aisle", count: 5, spacing: 2 },
      { props: [Prop.CRATE], zone: "wall", count: 5 },
      { props: [Prop.WORKBENCH], zone: "wall", count: 2 },
    ],
  ]),
  "banking-hall": furnishing("banking-hall", 5, 16, [
    [
      {
        props: [Prop.MARBLE_PILLAR],
        zone: "aisle",
        fallbackZone: "wall",
        count: 4,
        spacing: 3,
      },
      { props: [Prop.CHECKOUT], zone: "counter", rearAccess: true, count: 4 },
      { props: [Prop.SOFA], zone: "wall", count: 3 },
      { props: [Prop.DESK_COMPUTER], zone: "wall", count: 2 },
      { props: [Prop.PLANTER], zone: "corner", count: 3 },
    ],
  ]),
  vault: furnishing("vault", 4, 10, [
    [
      { props: [Prop.STRONGROOM], zone: "wall", count: 3 },
      { props: [Prop.FILING_CABINET], zone: "wall", count: 4 },
      { props: [Prop.CRATE], zone: "aisle", count: 2 },
    ],
  ]),
  workshop: furnishing("workshop", 4, 10, [
    [
      { props: [Prop.WORKBENCH], zone: "wall", count: 3 },
      { props: [Prop.SHELVING], zone: "wall", count: 3 },
      { props: [Prop.CRATE], zone: "aisle", count: 4 },
    ],
  ]),
};

/** Derives the catalogue of allowed props from its authored arrangements. */
function furnishing(
  id: KnownRoomKindId,
  tilesPerProp: number,
  maxProps: number,
  layouts: readonly (readonly FurnishingGroup[])[],
): RoomFurnishing {
  const arrangements: RoomArrangement[] = layouts.map((groups) => ({ groups }));
  return {
    id,
    tilesPerProp,
    maxProps,
    arrangements,
    props: [
      ...new Set(
        layouts.flatMap((groups) => groups.flatMap((group) => group.props)),
      ),
    ],
  };
}

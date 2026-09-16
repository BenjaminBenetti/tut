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
  office: furnishing("office", 4, 7, [
    [
      { props: [Prop.DESK_COMPUTER], zone: "wall", count: 3, spacing: 2 },
      { props: [Prop.FILING_CABINET], zone: "wall", count: 2 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
    ],
    [
      { props: [Prop.DESK_COMPUTER], zone: "aisle", count: 2, spacing: 2 },
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
  kitchen: furnishing("kitchen", 4, 6, [
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
  bathroom: furnishing("bathroom", 4, 3, [
    [
      { props: [Prop.BATHROOM_VANITY], zone: "wall", count: 1 },
      { props: [Prop.TOILET], zone: "wall", count: 1 },
      { props: [Prop.PLANTER], zone: "corner", count: 1 },
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

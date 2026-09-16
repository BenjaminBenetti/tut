import type { BuildingInteriorVariant } from "../model/building-room-program";
import { RoomKindIds as Room } from "./room-kind-ids";

/** Distinct businesses share a storefront shell, with their own sales and staff spaces. */
export const SHOP_INTERIOR_VARIANTS: readonly BuildingInteriorVariant[] = [
  shop("grocery", Room.GROCERY, Room.STORAGE, Room.BREAK_ROOM),
  shop("bakery-cafe", Room.BAKERY_CAFE, Room.KITCHEN, Room.STORAGE),
  shop("pharmacy", Room.PHARMACY, Room.STORAGE, Room.OFFICE),
  shop("clothing", Room.CLOTHING, Room.STORAGE, Room.OFFICE),
  shop("electronics", Room.ELECTRONICS, Room.WORKSHOP, Room.STORAGE),
  shop("hardware", Room.HARDWARE, Room.WORKSHOP, Room.STORAGE),
  shop("bookshop", Room.BOOKSHOP, Room.STORAGE, Room.BREAK_ROOM),
];

/** Keeps the sales floor at the entrance and the upstairs devoted to staff and stock. */
function shop(
  id: string,
  salesRoom: string,
  serviceRoom: string,
  secondaryRoom: string,
): BuildingInteriorVariant {
  return {
    id,
    ground: {
      arrival: salesRoom,
      primary: [serviceRoom, secondaryRoom],
      repeat: [serviceRoom, secondaryRoom],
    },
    upper: {
      arrival: Room.OFFICE,
      primary: [serviceRoom, Room.BREAK_ROOM],
      repeat: [serviceRoom, secondaryRoom],
    },
  };
}

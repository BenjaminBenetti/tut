import type { RoomFurnishing } from "../model/room-furnishing";
import { PropKindIds } from "./props";
import type { KnownRoomKindId } from "./room-kind-ids";

// ===========================================
// Room furnishing
// ===========================================

/**
 * Interior cover per room kind (ADR 0004 §4.4). Storage rooms are dense
 * with crates and shelving; halls and rooms get sparse furniture so a
 * firefight inside a house has something to duck behind. Numbers are
 * starting points; tune them in the preview harness, not in the pass.
 */
export const ROOM_FURNISHING: Readonly<
  Record<KnownRoomKindId, RoomFurnishing>
> = {
  hall: {
    id: "hall",
    tilesPerProp: 8,
    maxProps: 2,
    props: [PropKindIds.TABLE, PropKindIds.CRATE],
  },
  room: {
    id: "room",
    tilesPerProp: 6,
    maxProps: 2,
    props: [PropKindIds.TABLE],
  },
  storage: {
    id: "storage",
    tilesPerProp: 5,
    maxProps: 3,
    props: [PropKindIds.CRATE, PropKindIds.SHELVING],
  },
};

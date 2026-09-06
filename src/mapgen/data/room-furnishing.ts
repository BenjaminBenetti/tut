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
  // Interior cover at the ADR 0009 room size (#829): a squad fighting
  // through a 4×5 room finds three pieces of cover in it, a storage bay
  // twice that, and a corridor a crate or two to duck behind.
  hall: {
    id: "hall",
    tilesPerProp: 7,
    maxProps: 3,
    props: [PropKindIds.TABLE, PropKindIds.CRATE],
  },
  room: {
    id: "room",
    tilesPerProp: 6,
    maxProps: 4,
    props: [PropKindIds.TABLE, PropKindIds.SHELVING],
  },
  storage: {
    id: "storage",
    tilesPerProp: 4,
    maxProps: 8,
    props: [PropKindIds.CRATE, PropKindIds.SHELVING],
  },
  corridor: {
    id: "corridor",
    tilesPerProp: 10,
    maxProps: 2,
    props: [PropKindIds.CRATE],
  },
};

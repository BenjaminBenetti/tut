import { describe, expect, it } from "vitest";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { BUILDING_ROOM_PROGRAMS } from "../../data/building-room-programs";
import type { Room } from "../../model/building";
import { assignRoomPurposes } from "./room-programmer";

/** A corridor with four differently sized rooms, including a small washroom. */
function rooms(): Room[] {
  return [
    {
      id: "corridor",
      floorIndex: 0,
      rect: { x: 1, z: 1, w: 1, d: 10 },
      kind: "corridor",
    },
    { id: "front", floorIndex: 0, rect: { x: 2, z: 1, w: 4, d: 4 } },
    { id: "middle", floorIndex: 0, rect: { x: 2, z: 5, w: 4, d: 4 } },
    { id: "back", floorIndex: 0, rect: { x: 6, z: 1, w: 4, d: 4 } },
    { id: "small", floorIndex: 0, rect: { x: 6, z: 5, w: 3, d: 3 } },
  ];
}

describe("room purposes", () => {
  it("preserves a front-door corridor and gives its nearest room a public use", () => {
    const assigned = assignRoomPurposes(
      rooms(),
      BUILDING_ROOM_PROGRAMS.tower.ground,
      { x: 1, y: 0, z: 1 },
      true,
      new Mulberry32Rng(2),
    );
    expect(assigned.find((room) => room.id === "corridor")?.kind).toBe(
      "corridor",
    );
    expect(assigned.find((room) => room.id === "front")?.kind).toBe(
      "reception",
    );
    expect(assigned.map((room) => room.kind)).toEqual(
      expect.arrayContaining(["office", "meeting", "break-room"]),
    );
  });

  it("assigns residential living, sleeping, cooking and a compact bathroom", () => {
    for (const building of ["house", "apartment"] as const) {
      const assigned = assignRoomPurposes(
        rooms(),
        BUILDING_ROOM_PROGRAMS[building].ground,
        { x: 2, y: 0, z: 2 },
        true,
        new Mulberry32Rng(4),
      );
      expect(assigned.find((room) => room.id === "front")?.kind).toBe(
        "living-room",
      );
      expect(assigned.find((room) => room.id === "small")?.kind).toBe(
        "bathroom",
      );
      expect(assigned.map((room) => room.kind)).toEqual(
        expect.arrayContaining(["bedroom", "kitchen"]),
      );
    }
  });

  it("gives a shop a sales floor at its entrance, stockrooms behind, and offices upstairs", () => {
    const entrance = { x: 7, y: 0, z: 2 };
    const ground = assignRoomPurposes(
      rooms(),
      BUILDING_ROOM_PROGRAMS.shop.ground,
      entrance,
      true,
      new Mulberry32Rng(3),
    );
    const upper = assignRoomPurposes(
      rooms(),
      BUILDING_ROOM_PROGRAMS.shop.upper,
      entrance,
      false,
      new Mulberry32Rng(3),
    );
    expect(ground.find((room) => room.id === "back")?.kind).toBe("retail");
    expect(ground.some((room) => room.kind === "storage")).toBe(true);
    expect(upper.map((room) => room.kind)).toEqual(
      expect.arrayContaining(["office", "storage", "break-room"]),
    );
  });

  it("adds a workshop and an office to warehouse storage bays", () => {
    const assigned = assignRoomPurposes(
      rooms(),
      BUILDING_ROOM_PROGRAMS.warehouse.ground,
      { x: 2, y: 0, z: 2 },
      true,
      new Mulberry32Rng(9),
    );
    expect(assigned.map((room) => room.kind)).toEqual(
      expect.arrayContaining(["storage", "workshop", "office"]),
    );
  });

  it("is deterministic, leaves its room records untouched, and supports generic templates", () => {
    const input = rooms();
    const before = structuredClone(input);
    const entrance = { x: 2, y: 0, z: 2 };
    const first = assignRoomPurposes(
      input,
      undefined,
      entrance,
      true,
      new Mulberry32Rng(6),
    );
    expect(first).toEqual(
      assignRoomPurposes(
        input,
        undefined,
        entrance,
        true,
        new Mulberry32Rng(6),
      ),
    );
    expect(first.find((room) => room.id === "front")?.kind).toBe("hall");
    expect(input).toEqual(before);
  });
});

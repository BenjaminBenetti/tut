import { describe, expect, it } from "vitest";

import { createRegistry } from "../../core/service/definition-registry";
import { PROP_DEFINITIONS } from "./props";
import { ROOM_FURNISHING } from "./room-furnishing";
import { RoomKindIds } from "./room-kind-ids";

describe("room furnishing", () => {
  const props = createRegistry("prop", PROP_DEFINITIONS);
  const furnishing = createRegistry(
    "room furnishing",
    Object.values(ROOM_FURNISHING),
  );

  it("covers every room kind exactly once", () => {
    for (const id of Object.values(RoomKindIds)) {
      expect(furnishing.has(id), id).toBe(true);
    }
    expect(furnishing.ids.length).toBe(Object.values(RoomKindIds).length);
  });

  it("draws only from interior prop kinds with sane quotas", () => {
    for (const entry of furnishing.values) {
      expect(entry.tilesPerProp, entry.id).toBeGreaterThanOrEqual(1);
      expect(entry.maxProps, entry.id).toBeGreaterThanOrEqual(1);
      expect(entry.props.length, entry.id).toBeGreaterThan(0);
      for (const kind of entry.props) {
        expect(props.get(kind).placements, `${entry.id} → ${kind}`).toContain(
          "interior",
        );
      }
    }
  });
});

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

  it("gives every room a usable arrangement whose groups stay inside its catalogue", () => {
    for (const entry of furnishing.values) {
      expect(entry.arrangements?.length, entry.id).toBeGreaterThan(0);
      for (const arrangement of entry.arrangements ?? []) {
        expect(arrangement.groups.length, entry.id).toBeGreaterThan(0);
        for (const group of arrangement.groups) {
          expect(group.count, entry.id).toBeGreaterThan(0);
          expect(group.props.length, entry.id).toBeGreaterThan(0);
          expect(group.spacing ?? 1, entry.id).toBeGreaterThanOrEqual(1);
          for (const kind of group.props)
            expect(entry.props, entry.id).toContain(kind);
        }
      }
    }
  });
});

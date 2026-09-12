import { describe, expect, it } from "vitest";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { MapDraft } from "../model/map-draft";
import { CoverLevel } from "../model/cover";
import { PassMask } from "../model/pass-mask";
import { createDefaultRegistries } from "./default-registries";
import { freezeDraft } from "./draft-freezer";
import { FixtureMapBuilder } from "./fixture-map-builder";
import { validateTacticalMap } from "./map-validator";
import { propTiles } from "./prop-footprint";

const anchor = { x: 2, y: 0, z: 2 };
const tail = { x: 3, y: 0, z: 2 };

describe("multi-tile prop contract", () => {
  it("requires explicit car cells to match the declared rotated rectangle while accepting legacy single cells", () => {
    const registries = createDefaultRegistries();
    for (const cells of [
      [anchor, { ...anchor, z: anchor.z + 1 }],
      [anchor, tail, { ...tail, x: tail.x + 1 }],
      [anchor, tail, { ...anchor, z: anchor.z + 1 }],
    ]) {
      const map = new FixtureMapBuilder(6, 6, 1)
        .fillGround()
        .prop("car", anchor, 0, cells)
        .build();
      expect(
        validateTacticalMap(map, registries).some((v) => v.invariant === "I2"),
      ).toBe(true);
    }
    const legacy = new FixtureMapBuilder(6, 6, 1)
      .fillGround()
      .prop("car", anchor)
      .build();
    expect(
      validateTacticalMap(legacy, registries).filter(
        (v) => v.invariant === "I2",
      ),
    ).toEqual([]);
  });
  it("reserves both halves atomically and removes the complete car through either half", () => {
    const draft = new MapDraft(6, 6, new SequentialIdGenerator(), "road");
    draft.addProp("crate", tail);
    expect(() => draft.addProp("car", anchor, 0, [anchor, tail])).toThrow();
    expect(draft.propAt(anchor)).toBeUndefined();
    draft.removeProp(draft.propAt(tail)!.id);
    const prop = draft.addProp("car", anchor, 0, [anchor, tail]);
    expect(prop.id).toBe("prop-2");
    expect(draft.propAt(anchor)).toBe(prop);
    expect(draft.propAt(tail)).toBe(prop);
    draft.removeProp(draft.propAt(tail)!.id);
    expect(draft.propAt(anchor)).toBeUndefined();
    expect(draft.propAt(tail)).toBeUndefined();
    expect(draft.props).toHaveLength(0);
  });

  it("freezes independent blocked, high-cover, sight-blocking tiles on both halves", () => {
    const draft = new MapDraft(6, 6, new SequentialIdGenerator(), "road");
    const prop = draft.addProp("car", anchor, 0, [anchor, tail]);
    const recipe = new FixtureMapBuilder(6, 6, 1).fillGround().build().recipe;
    const registries = createDefaultRegistries();
    const map = freezeDraft(draft, recipe, registries);
    for (const coord of [anchor, tail]) {
      const tile = map.tiles.find((t) => t.x === coord.x && t.z === coord.z)!;
      expect(tile).toMatchObject({
        pass: PassMask.NONE,
        coverProvided: CoverLevel.HIGH,
        blocksLos: true,
        propId: prop.id,
      });
    }
    expect(map.props[0]!.occupiedTiles).not.toBe(prop.occupiedTiles);
    expect(map.props[0]!.occupiedTiles![0]).not.toBe(prop.occupiedTiles![0]);
    expect(
      validateTacticalMap(map, registries).filter((v) => v.invariant === "I2"),
    ).toEqual([]);
    expect(
      propTiles({ id: "old", kind: "car", tile: anchor, rotation: 0 }),
    ).toEqual([anchor]);
  });

  it("rejects duplicate, disconnected, missing-anchor, nonlevel and out-of-bounds footprints", () => {
    const draft = new MapDraft(6, 6, new SequentialIdGenerator(), "road");
    for (const footprint of [
      [],
      [anchor, anchor],
      [tail],
      [anchor, { ...tail, x: 5 }],
      [anchor, { ...tail, y: 1 }],
      [anchor, { ...tail, x: 6 }],
    ])
      expect(() => draft.addProp("car", anchor, 0, footprint)).toThrow();
    expect(draft.props).toHaveLength(0);
    expect(draft.addProp("car", anchor, 0, [anchor, tail]).id).toBe("prop-1");
  });

  it("validates reverse ownership on the trailing tile as well as the anchor", () => {
    const map = new FixtureMapBuilder(6, 6, 1)
      .fillGround()
      .prop("car", anchor, 0, [anchor, tail])
      .build();
    const registries = createDefaultRegistries();
    expect(
      validateTacticalMap(map, registries).filter((v) => v.invariant === "I2"),
    ).toEqual([]);
    const broken = {
      ...map,
      tiles: map.tiles.map((tile) =>
        tile.x === tail.x && tile.z === tail.z
          ? { ...tile, pass: PassMask.ALL, propId: undefined }
          : tile,
      ),
    };
    expect(
      validateTacticalMap(broken, registries).some((v) => v.invariant === "I2"),
    ).toBe(true);
  });
});

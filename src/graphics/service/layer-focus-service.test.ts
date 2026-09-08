import { describe, expect, it } from "vitest";

import {
  focusAt,
  focusGroundLevel,
  stepFocus,
  storeyCount,
  topFocus,
} from "./layer-focus-service";
import type { LayerFocusSource } from "./layer-focus-service";

/** A map with buildings of the given storey counts, all on `ground`. */
function map(ground: number, ...storeys: number[]): LayerFocusSource {
  return {
    buildings: storeys.map((floors) => ({
      groundLevel: ground,
      floors: Array.from({ length: floors }, () => ({})),
    })),
  };
}

describe("storeyCount", () => {
  // A storey is two engine layers (ADR 0008), so a three-floor building
  // reaches ground + 6 and offers three views: ground floor, two floors,
  // all of it.
  it("counts one view per storey of the tallest building", () => {
    expect(storeyCount(map(0, 3))).toBe(3);
    expect(storeyCount(map(0, 1, 3, 2))).toBe(3);
  });

  // The control is inert rather than absent: a key that does nothing on
  // open ground is easier to explain than one that comes and goes.
  it("is one where there is nothing to peel", () => {
    expect(storeyCount({ buildings: [] })).toBe(1);
    expect(storeyCount(map(0, 1))).toBe(1);
  });

  // #978: counted per building, not across the map's height. Two
  // two-storey buildings offer two floor views however far apart they
  // stand — the four layers between them are elevation the player
  // cannot act on, and counting them made "floor 3" mean the third
  // floor of one building and the first of another.
  it("counts the tallest building's floors, not the map's height", () => {
    expect(
      storeyCount({
        buildings: [
          { groundLevel: 4, floors: [{}, {}] },
          { groundLevel: 8, floors: [{}, {}] },
        ],
      }),
    ).toBe(2);
    // The tallest wins, wherever it stands.
    expect(
      storeyCount({
        buildings: [
          { groundLevel: 8, floors: [{}] },
          { groundLevel: 0, floors: [{}, {}, {}] },
        ],
      }),
    ).toBe(3);
  });

  // The terrain anchor is unchanged: ground and roads have no floors to
  // count, so they keep the height rule.
  it("still anchors the terrain cut to the lowest building", () => {
    expect(
      focusGroundLevel({
        buildings: [
          { groundLevel: 4, floors: [{}] },
          { groundLevel: 8, floors: [{}] },
        ],
      }),
    ).toBe(4);
  });
});

describe("focusAt", () => {
  // The cut sits on the TOP layer of the storey, which is why a wall is
  // cut above head height rather than through the middle of it.
  it("cuts at the top layer of the storey asked for", () => {
    const three = map(0, 3);
    expect(focusAt(three, 0)).toEqual({
      storey: 0,
      storeyCount: 3,
      cutLevel: 1,
    });
    expect(focusAt(three, 1)).toEqual({
      storey: 1,
      storeyCount: 3,
      cutLevel: 3,
    });
  });

  // Not a number above the roof: "all of it" must not depend on the
  // arithmetic landing above every piece of art, roof geometry included.
  it("draws everything at the top storey", () => {
    expect(focusAt(map(0, 3), 2).cutLevel).toBeUndefined();
    expect(topFocus(map(0, 3))).toEqual({
      storey: 2,
      storeyCount: 3,
      cutLevel: undefined,
    });
  });

  it("clamps rather than wraps at both ends", () => {
    const three = map(0, 3);
    expect(focusAt(three, -5).storey).toBe(0);
    expect(focusAt(three, 99).storey).toBe(2);
    expect(stepFocus(three, focusAt(three, 0), -1).storey).toBe(0);
    expect(stepFocus(three, focusAt(three, 2), 1).storey).toBe(2);
  });

  it("moves one storey per press", () => {
    const four = map(0, 4);
    let focus = topFocus(four);
    expect(focus.storey).toBe(3);
    focus = stepFocus(four, focus, -1);
    expect(focus).toEqual({ storey: 2, storeyCount: 4, cutLevel: 5 });
    focus = stepFocus(four, focus, 1);
    expect(focus.cutLevel).toBeUndefined();
  });

  // #978: the hill no longer costs the player storeys. Two two-storey
  // buildings four layers apart offer two floors, and `cutLevel` — now
  // the terrain cut alone — is measured from the lower ground. What
  // happens to the buildings themselves is `TacticalMapView`'s job, by
  // floor number, and is tested there.
  it("gives a hillside map the same floors as a flat one", () => {
    const hill: LayerFocusSource = {
      buildings: [
        { groundLevel: 0, floors: [{}, {}] },
        { groundLevel: 4, floors: [{}, {}] },
      ],
    };
    const flat: LayerFocusSource = {
      buildings: [
        { groundLevel: 0, floors: [{}, {}] },
        { groundLevel: 0, floors: [{}, {}] },
      ],
    };
    expect(storeyCount(hill)).toBe(storeyCount(flat));
    expect(focusAt(hill, 0)).toEqual(focusAt(flat, 0));
    expect(focusAt(hill, 0).cutLevel).toBe(1);
    expect(focusAt(hill, 1).cutLevel).toBeUndefined();
  });
});

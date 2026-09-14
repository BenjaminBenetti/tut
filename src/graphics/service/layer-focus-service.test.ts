import { describe, expect, it } from "vitest";

import {
  floorOf,
  focusAt,
  isTopFocus,
  stepFocus,
  storeyCount,
  topFocus,
} from "./layer-focus-service";
import type { LayerFocusSource } from "./layer-focus-service";

/** A map with buildings of the given storey counts. */
function map(...storeys: number[]): LayerFocusSource {
  return {
    buildings: storeys.map((floors) => ({
      floors: Array.from({ length: floors }, () => ({})),
    })),
  };
}

describe("storeyCount", () => {
  // The roof is its own step (#1136): a three-floor building offers four
  // views — ground floor, two floors, all three floors with the roof
  // off, and the whole thing roofed. Before this the count was the
  // floors, and the top view of the tallest building was its roof, so
  // no press ever showed its top floor.
  it("counts one view per floor of the tallest building, plus the roof", () => {
    expect(storeyCount(map(3))).toBe(4);
    expect(storeyCount(map(1, 3, 2))).toBe(4);
  });

  // A one-floor building is the reported case in miniature: with the
  // count equal to the floors it had one view, roofed, and its inside
  // could never be seen.
  it("gives a single-storey building a roof-off view", () => {
    expect(storeyCount(map(1))).toBe(2);
  });

  // The control is inert rather than absent: a key that does nothing on
  // open ground is easier to explain than one that comes and goes.
  it("is one where there is nothing to peel", () => {
    expect(storeyCount({ buildings: [] })).toBe(1);
  });
});

describe("focusAt", () => {
  it("carries no cut height: the view is by storey, and terrain is never cut", () => {
    expect(focusAt(map(3), 0)).toEqual({ storey: 0, storeyCount: 4 });
    expect(focusAt(map(3), 1)).toEqual({ storey: 1, storeyCount: 4 });
  });

  it("opens on the roofed top, which is the only top view", () => {
    expect(topFocus(map(3))).toEqual({ storey: 3, storeyCount: 4 });
    expect(isTopFocus(topFocus(map(3)))).toBe(true);
    expect(isTopFocus(focusAt(map(3), 2))).toBe(false);
    expect(isTopFocus(topFocus({ buildings: [] }))).toBe(true);
  });

  it("clamps rather than wraps at both ends", () => {
    const three = map(3);
    expect(focusAt(three, -5).storey).toBe(0);
    expect(focusAt(three, 99).storey).toBe(3);
    expect(stepFocus(three, focusAt(three, 0), -1).storey).toBe(0);
    expect(stepFocus(three, focusAt(three, 3), 1).storey).toBe(3);
  });

  it("moves one storey per press", () => {
    const four = map(4);
    let focus = topFocus(four);
    expect(focus.storey).toBe(4);
    focus = stepFocus(four, focus, -1);
    expect(focus).toEqual({ storey: 3, storeyCount: 5 });
    expect(isTopFocus(focus)).toBe(false);
    focus = stepFocus(four, focus, 1);
    expect(isTopFocus(focus)).toBe(true);
  });
});

describe("floorOf", () => {
  // "2 / 2" then "All", not "2 / 3" then "3 / 3": the top view is the
  // roof going back on, not a floor the player should go looking for.
  it("numbers the floors and leaves the roofed top unnumbered", () => {
    const two = map(2);
    expect(floorOf(topFocus(two))).toEqual({ floor: undefined, floors: 2 });
    expect(floorOf(focusAt(two, 1))).toEqual({ floor: 2, floors: 2 });
    expect(floorOf(focusAt(two, 0))).toEqual({ floor: 1, floors: 2 });
  });

  it("has no floors to number on open ground", () => {
    expect(floorOf(topFocus({ buildings: [] }))).toEqual({
      floor: undefined,
      floors: 0,
    });
  });
});

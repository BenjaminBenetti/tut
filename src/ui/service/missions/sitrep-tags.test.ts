import { describe, expect, it } from "vitest";

import { SITREP_PRESENTATION } from "../../data/sitrep-presentation";
import {
  compactSitrepLabel,
  HAZARD_MARKER,
  HELPS_MARKER,
  sitrepBadgeClass,
  sitrepMarker,
  sitrepTagsOf,
} from "./sitrep-tags";

describe("sitrepTagsOf", () => {
  it("lists an offer's sitreps in the order it rolled them", () => {
    const tags = sitrepTagsOf({ sitreps: ["local-guides", "nightfall"] });
    expect(tags.map((tag) => tag.id)).toEqual(["local-guides", "nightfall"]);
    expect(tags[0]).toEqual({
      id: "local-guides",
      ...SITREP_PRESENTATION["local-guides"],
    });
  });

  it("is empty for an offer without sitreps", () => {
    expect(sitrepTagsOf({})).toEqual([]);
  });
});

describe("markers", () => {
  const helps = SITREP_PRESENTATION["salvage-rich"];
  const hurts = SITREP_PRESENTATION["city-ablaze"];

  it("marks a helping sitrep in words and in the ok colour", () => {
    expect(sitrepMarker(helps)).toBe(HELPS_MARKER);
    expect(sitrepBadgeClass(helps)).toBe("tut-badge--ok");
    expect(compactSitrepLabel(helps)).toBe("+ Salvage Rich");
  });

  it("marks every other sitrep as a hazard in the warn colour", () => {
    expect(sitrepMarker(hurts)).toBe(HAZARD_MARKER);
    expect(sitrepBadgeClass(hurts)).toBe("tut-badge--warn");
    expect(compactSitrepLabel(hurts)).toBe("City Ablaze");
  });
});

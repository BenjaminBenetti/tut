import { describe, expect, it } from "vitest";

import { EVENT_TYPES } from "../data/event-types";
import type { EventTypeId } from "../model/event-type";
import { EVENT_TYPE_IDS } from "../model/event-type";
import { DataEventTypeCatalogue } from "./event-type-catalogue";

const ALL = EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]);

describe("DataEventTypeCatalogue", () => {
  it("looks up types by id and reports unknown ids as undefined", () => {
    const catalogue = new DataEventTypeCatalogue(ALL);
    expect(catalogue.getEventType("city-plea")?.title).toBe("Plea from {city}");
    expect(catalogue.getEventType("meteor" as EventTypeId)).toBeUndefined();
  });

  it("lists types in the order supplied", () => {
    const catalogue = new DataEventTypeCatalogue([...ALL].reverse());
    expect(catalogue.listEventTypes().map((t) => t.id)).toEqual(
      [...EVENT_TYPE_IDS].reverse(),
    );
  });

  it("rejects duplicate ids", () => {
    const plea = EVENT_TYPES["city-plea"];
    expect(() => new DataEventTypeCatalogue([plea, plea])).toThrow(/Duplicate/);
  });
});

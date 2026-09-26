import { describe, expect, it } from "vitest";

import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import {
  addCityInfestation,
  setCityInfestation,
} from "./city-infestation-service";
import { fixtureState } from "./missions/mission-fixtures.test-helper";

describe("setCityInfestation", () => {
  it("sets the city and emits one change from its old value", () => {
    const state = fixtureState();
    const { state: next, events } = setCityInfestation(state, "mid", 20);
    expect(next.map.cities.find((c) => c.id === "mid")?.infestation).toBe(20);
    expect(events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "mid", from: 50, to: 20 },
      },
    ]);
    expect(state.map.cities.find((c) => c.id === "mid")?.infestation).toBe(50);
    expect(next.map.regions).toBe(state.map.regions);
  });

  it("clamps to the city's bounds", () => {
    const low = setCityInfestation(fixtureState(), "mid", -40);
    expect(low.state.map.cities.find((c) => c.id === "mid")?.infestation).toBe(
      0,
    );
    const high = setCityInfestation(fixtureState(), "mid", 400);
    expect(high.state.map.cities.find((c) => c.id === "mid")?.infestation).toBe(
      100,
    );
  });

  it("forgets a city set to 0 (GDD §5.3)", () => {
    const { state } = setCityInfestation(fixtureState(), "mid", 0);
    expect(state.map.cities.find((c) => c.id === "mid")?.detected).toBe(false);
  });

  it("returns the same state with no event when nothing moves or the city is unknown", () => {
    const state = fixtureState();
    expect(setCityInfestation(state, "full", 120)).toEqual({
      state,
      events: [],
    });
    expect(setCityInfestation(state, "full", 120).state).toBe(state);
    expect(setCityInfestation(state, "atlantis", 5).state).toBe(state);
  });
});

describe("addCityInfestation", () => {
  it("adds to the city's current value, clamped", () => {
    const { state, events } = addCityInfestation(fixtureState(), "low", 15);
    expect(state.map.cities.find((c) => c.id === "low")?.infestation).toBe(25);
    expect(events).toHaveLength(1);
    const capped = addCityInfestation(fixtureState(), "mid", 90);
    expect(
      capped.state.map.cities.find((c) => c.id === "mid")?.infestation,
    ).toBe(100);
    expect(addCityInfestation(fixtureState(), "atlantis", 5).events).toEqual(
      [],
    );
  });
});

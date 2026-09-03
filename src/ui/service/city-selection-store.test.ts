import { describe, expect, it, vi } from "vitest";

import { CitySelectionStore } from "./city-selection-store";

describe("CitySelectionStore", () => {
  it("starts empty, records selections and notifies subscribers", () => {
    const store = new CitySelectionStore();
    const listener = vi.fn<(cityId: string | undefined) => void>();
    store.subscribe(listener);
    expect(store.cityId).toBeUndefined();
    store.select("new-york");
    expect(store.cityId).toBe("new-york");
    store.select("new-york");
    store.select(undefined);
    expect(listener.mock.calls.map((c) => c[0])).toEqual([
      "new-york",
      "new-york",
      undefined,
    ]);
  });

  it("stops notifying after unsubscribe", () => {
    const store = new CitySelectionStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.select("tokyo");
    expect(listener).not.toHaveBeenCalled();
  });
});

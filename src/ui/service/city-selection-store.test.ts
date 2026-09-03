import { describe, expect, it, vi } from "vitest";

import { OverworldSelectionState } from "./overworld-selection-state";
import { CitySelectionStore } from "./city-selection-store";

describe("CitySelectionStore (former name of OverworldSelectionState)", () => {
  it("is the same class under its old name", () => {
    expect(CitySelectionStore).toBe(OverworldSelectionState);
  });

  it("records selections and notifies on changes, clearing with undefined", () => {
    const store = new CitySelectionStore();
    const listener =
      vi.fn<(selection: { cityId: string | undefined }) => void>();
    store.subscribe(listener);
    expect(store.cityId).toBeUndefined();
    store.select("new-york");
    expect(store.cityId).toBe("new-york");
    store.select("new-york");
    store.select(undefined);
    expect(listener.mock.calls.map((c) => c[0].cityId)).toEqual([
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

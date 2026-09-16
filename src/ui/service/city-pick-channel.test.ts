import { describe, expect, it, vi } from "vitest";

import { CityPickChannel } from "./city-pick-channel";

describe("CityPickChannel", () => {
  it("delivers picks to subscribers until they unsubscribe", () => {
    const channel = new CityPickChannel();
    const heard = vi.fn();
    const stop = channel.onCityPicked(heard);
    channel.emit("tokyo");
    expect(heard).toHaveBeenCalledWith("tokyo");
    stop();
    channel.emit("seoul");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("projects through the attached projector and answers nothing without one", () => {
    const channel = new CityPickChannel();
    expect(channel.cityScreenPosition("tokyo")).toBeUndefined();
    channel.useProjector((id) =>
      id === "tokyo" ? { x: 10, y: 20 } : undefined,
    );
    expect(channel.cityScreenPosition("tokyo")).toEqual({ x: 10, y: 20 });
    expect(channel.cityScreenPosition("seoul")).toBeUndefined();
    channel.useProjector(undefined);
    expect(channel.cityScreenPosition("tokyo")).toBeUndefined();
  });
});

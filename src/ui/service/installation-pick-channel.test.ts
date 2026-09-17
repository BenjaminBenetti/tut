import { describe, expect, it, vi } from "vitest";

import { InstallationPickChannel } from "./installation-pick-channel";

describe("InstallationPickChannel (#1155)", () => {
  it("delivers picks to subscribers until they unsubscribe", () => {
    const channel = new InstallationPickChannel();
    const heard = vi.fn();
    const stop = channel.onInstallationPicked(heard);
    channel.emit("deployable-1");
    expect(heard).toHaveBeenCalledWith("deployable-1");
    stop();
    channel.emit("deployable-2");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("projects through the attached projector and answers nothing without one", () => {
    const channel = new InstallationPickChannel();
    expect(channel.installationScreenPosition("deployable-1")).toBeUndefined();
    channel.useProjector((id) =>
      id === "deployable-1" ? { x: 10, y: 20 } : undefined,
    );
    expect(channel.installationScreenPosition("deployable-1")).toEqual({
      x: 10,
      y: 20,
    });
    expect(channel.installationScreenPosition("deployable-2")).toBeUndefined();
    channel.useProjector(undefined);
    expect(channel.installationScreenPosition("deployable-1")).toBeUndefined();
  });
});

// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { TacticalHudView } from "./tactical-hud-view";
import type { JevInspector } from "../model/jev-inspector";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";

it("exposes no inspector DOM or subscription without development tools", () => {
  const subscribe = vi.fn(() => vi.fn());
  const inspector: JevInspector = {
    configured: true,
    history: [],
    mission: () => undefined,
    capture: () => {
      throw new Error("Must not capture");
    },
    evaluate: () => Promise.resolve(),
    step: () => Promise.resolve(),
    configure: vi.fn(),
    subscribe,
    pause: vi.fn(),
    setPlaybackPending: vi.fn(),
    start: vi.fn(),
    dispose: vi.fn(),
  };
  const root = document.createElement("div");
  const hud = new TacticalHudView(
    { onCommand: vi.fn(), onLeave: vi.fn() },
    {
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
      jev: inspector,
    },
  );
  hud.mount(root);
  expect(root.querySelector('[data-testid="jev-toggle"]')).toBeNull();
  expect(root.querySelector('[data-testid="jev-inspector"]')).toBeNull();
  expect(subscribe).not.toHaveBeenCalled();
  hud.unmount();
});

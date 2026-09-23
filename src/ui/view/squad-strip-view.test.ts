// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { configureJev } from "../../tactical/model/jev-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { JevInspector } from "../model/jev-inspector";
import { hudMission } from "./mission-hud.test-helper";
import { TacticalHudView } from "./tactical-hud-view";

/** Mount the real HUD with observable command and automation boundaries. */
function setup(configured = true) {
  const mission: TacticalState = {
    ...hudMission(),
    jev: {
      entities: {
        s1: { enabled: true, entityPrompt: "Cover Alpha" },
        s2: { enabled: false, entityPrompt: "Guard extraction" },
        b1: { enabled: true, entityPrompt: "Defend the nest" },
      },
      commanders: { tdf: "Hold together", bugs: "Protect the eggs" },
    },
  };
  const commands: TacticalCommand[] = [];
  const pausedAtDispatch: boolean[] = [];
  const onLookAt = vi.fn();
  const pause = vi.fn<(paused: boolean) => void>();
  const onAutomationPause = vi.fn();
  const inspector: JevInspector = {
    configured,
    history: [],
    mission: () => mission,
    capture: () => {
      throw new Error("No model evaluation in this UI test");
    },
    evaluate: () => Promise.resolve(),
    step: () => Promise.resolve(),
    configure: vi.fn(),
    subscribe: () => () => undefined,
    pause,
    setPlaybackPending: vi.fn(),
    start: vi.fn(),
    dispose: vi.fn(),
  };
  const root = document.createElement("div");
  document.body.append(root);
  const hud = new TacticalHudView(
    {
      onCommand: (command) => {
        commands.push(command);
        pausedAtDispatch.push(pause.mock.calls.at(-1)?.[0] === true);
      },
      onLeave: vi.fn(),
      onLookAt,
      onAutomationPause,
    },
    {
      jev: inspector,
      devTools: { placeable: [] },
      combatTuning: COMBAT_TUNING,
      objectiveTuning: OBJECTIVE_TUNING,
    },
  );
  hud.mount(root);
  hud.update(mission);
  const button = (id: string): HTMLButtonElement =>
    root.querySelector(`[data-testid="${id}"]`)!;
  const row = (id: string): HTMLElement =>
    root.querySelector(`[data-role="squad-list"] [data-unit-id="${id}"]`)!;
  const input = root.querySelector<HTMLTextAreaElement>(
    '[data-testid="squad-orders-input"]',
  )!;
  return {
    hud,
    root,
    mission,
    commands,
    pausedAtDispatch,
    pause,
    onAutomationPause,
    onLookAt,
    button,
    row,
    input,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("Squad bulk controls", () => {
  it("stages the complete Jev set, then applies only changed controllers with prompts intact", () => {
    const { hud, button, row, commands, pause, pausedAtDispatch, onLookAt } =
      setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    const apply = button("squad-jev-toggle");
    apply.click();
    expect(apply.textContent).toBe("Apply");
    expect(apply.getAttribute("aria-pressed")).toBe("true");
    expect(row("s1").getAttribute("aria-checked")).toBe("true");
    expect(row("s2").getAttribute("aria-checked")).toBe("false");
    row("s1").click();
    row("s2").dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    expect(commands).toEqual([]);
    expect(hud.getSelectedUnitId()).toBe("s1");
    expect(onLookAt).not.toHaveBeenCalled();
    apply.click();
    expect(commands).toEqual([
      configureJev(
        "s1",
        { enabled: false, entityPrompt: "Cover Alpha" },
        "Hold together",
      ),
      configureJev(
        "s2",
        { enabled: true, entityPrompt: "Guard extraction" },
        "Hold together",
      ),
    ]);
    expect(pausedAtDispatch).toEqual([true, true]);
    expect(pause.mock.calls).toEqual([[true], [false]]);
    expect(apply.textContent).toBe("Jev");
    expect(row("s1").getAttribute("role")).toBe("button");
    hud.unmount();
  });

  it("writes one order to multiple selected units without changing their control or faction orders", () => {
    const { hud, button, row, commands, input, pausedAtDispatch } = setup();
    const apply = button("squad-orders-toggle");
    apply.click();
    expect(apply.textContent).toBe("Apply");
    expect(apply.disabled).toBe(true);
    expect(document.activeElement).toBe(input);
    input.value = "Rally at extraction";
    row("s1").click();
    row("s2").click();
    expect(commands).toEqual([]);
    expect(apply.disabled).toBe(false);
    apply.click();
    expect(commands).toEqual([
      configureJev(
        "s1",
        { enabled: true, entityPrompt: "Rally at extraction" },
        "Hold together",
      ),
      configureJev(
        "s2",
        { enabled: false, entityPrompt: "Rally at extraction" },
        "Hold together",
      ),
    ]);
    expect(pausedAtDispatch).toEqual([true, true]);
    expect(input.closest("label")!.hidden).toBe(true);
    hud.unmount();
  });

  it("retains drafts across state refreshes, drops departed recipients and uses the latest faction orders", () => {
    const { hud, mission, button, row, input, commands } = setup();
    button("squad-orders-toggle").click();
    row("s1").click();
    row("s2").click();
    input.value = "Stay close";
    input.focus();
    hud.update({
      ...mission,
      units: mission.units.filter((unit) => unit.id !== "s2"),
      jev: {
        ...mission.jev!,
        commanders: { tdf: "Withdraw", bugs: "Protect the eggs" },
      },
    });
    expect(input.value).toBe("Stay close");
    expect(document.activeElement).toBe(input);
    expect(row("s1").getAttribute("aria-checked")).toBe("true");
    button("squad-orders-toggle").click();
    expect(commands).toEqual([
      configureJev(
        "s1",
        { enabled: true, entityPrompt: "Stay close" },
        "Withdraw",
      ),
    ]);
    hud.unmount();
  });

  it("discards drafts on Cancel, Escape, mode switches and mission replacement", () => {
    const { hud, mission, button, row, input, commands, pause } = setup();
    button("squad-jev-toggle").click();
    row("s1").click();
    button("squad-selection-cancel").click();
    button("squad-jev-toggle").click();
    expect(row("s1").getAttribute("aria-checked")).toBe("true");
    button("squad-orders-toggle").click();
    expect(row("s1").getAttribute("aria-checked")).toBe("false");
    row("s1").click();
    input.value = "Discard this";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(document.activeElement).toBe(button("squad-orders-toggle"));
    button("squad-orders-toggle").click();
    expect(input.value).toBe("");
    row("s1").click();
    hud.update({ ...mission, missionId: "another-mission" });
    expect(button("squad-selection-cancel").hidden).toBe(true);
    expect(commands).toEqual([]);
    expect(pause).toHaveBeenLastCalledWith(false);
    hud.unmount();
  });

  it("can release all existing Jev units offline without enabling unchecked manual units", () => {
    const { hud, button, row, commands } = setup(false);
    button("squad-jev-toggle").click();
    expect(row("s2").getAttribute("aria-disabled")).toBe("true");
    row("s2").click();
    expect(row("s2").getAttribute("aria-checked")).toBe("false");
    row("s1").click();
    expect(button("squad-jev-toggle").disabled).toBe(false);
    button("squad-jev-toggle").click();
    expect(commands).toEqual([
      configureJev(
        "s1",
        { enabled: false, entityPrompt: "Cover Alpha" },
        "Hold together",
      ),
    ]);
    hud.unmount();
  });

  it("keeps automatic play paused until both the inspector and the squad editor close", () => {
    const { hud, root, button, pause, onAutomationPause } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    button("jev-toggle").click();
    button("squad-orders-toggle").click();
    button("squad-selection-cancel").click();
    expect(pause.mock.calls).toEqual([[true]]);
    root
      .querySelector<HTMLButtonElement>(
        '[data-testid="jev-inspector"] header button',
      )!
      .click();
    expect(pause.mock.calls).toEqual([[true], [false]]);
    button("squad-orders-toggle").click();
    button("jev-toggle").click();
    root
      .querySelector<HTMLButtonElement>(
        '[data-testid="jev-inspector"] header button',
      )!
      .click();
    expect(pause).toHaveBeenLastCalledWith(true);
    hud.unmount();
    expect(pause).toHaveBeenLastCalledWith(false);
    expect(onAutomationPause.mock.calls).toEqual(pause.mock.calls);
  });
});

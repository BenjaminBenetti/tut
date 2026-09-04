// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { END_TURN } from "../../tactical/model/end-turn-command";
import { MOVE } from "../../tactical/model/move-command";
import { OVERWATCH } from "../../tactical/model/overwatch-command";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import { SPAWNER_NAME } from "../../tactical/service/attack-target-service";
import { previewAttack } from "../../tactical/service/combat-service";
import { hudMission } from "./mission-hud.test-helper";
import { TacticalHudView } from "./tactical-hud-view";

let root: HTMLElement;
const field = (name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-field="${name}"]`);

function setup() {
  const commands: TacticalCommand[] = [];
  const onBack = vi.fn();
  const hud = new TacticalHudView(
    { onCommand: (c) => commands.push(c), onBack },
    { combatTuning: COMBAT_TUNING },
  );
  hud.mount(root);
  const mission = hudMission();
  hud.update(mission);
  return { hud, commands, mission, onBack };
}

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
});

describe("TacticalHudView", () => {
  it("renders the banner and objectives and the placeholder card", () => {
    setup();
    expect(field("turn")?.textContent).toBe("2");
    expect(field("phase")?.dataset.phase).toBe("player");
    expect(field("objective-summary")?.textContent).toBe("1 / 2");
    expect(
      root.querySelector<HTMLElement>('[data-role="no-unit"]')?.hidden,
    ).toBe(false);
  });

  it("selecting a unit fills the card and enables the actions it can take", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(hud.getSelectedUnitId()).toBe("s1");
    expect(field("unit-name")?.textContent).toBe("Rifle Squad");
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="attack"]')?.disabled,
    ).toBe(false);
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="attack"]')?.disabled,
    ).toBe(true);
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    expect(field("unit-side")?.textContent).toBe("bugs · bug");
  });

  it("previews and fires at an egg spawner, naming it in the panel (#426)", () => {
    const commands: TacticalCommand[] = [];
    const hud = new TacticalHudView(
      { onCommand: (c) => commands.push(c), onBack: vi.fn() },
      { combatTuning: COMBAT_TUNING },
    );
    hud.mount(root);
    // Put the squad within the rifle's reach of the live spawner at (9,0,0).
    const base = hudMission();
    const mission = {
      ...base,
      units: base.units.map((u) =>
        u.id === "s1" ? { ...u, pos: { x: 5, y: 0, z: 0 } } : u,
      ),
    };
    hud.update(mission);
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "attack" });
    hud.handleIntent({ kind: "select-unit", unitId: "spawner-1" });

    expect(hud.getTargetUnitId()).toBe("spawner-1");
    // Aiming at a spawner never steals the selection from the squad.
    expect(hud.getSelectedUnitId()).toBe("s1");
    expect(field("target-name")?.textContent).toBe(SPAWNER_NAME);
    const expected = previewAttack(mission, "s1", "spawner-1", COMBAT_TUNING);
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    expect(field("hit-chance")?.textContent).toBe(
      `${String(expected.value.hitChance)}% hit`,
    );

    root
      .querySelector<HTMLButtonElement>('[data-action="confirm-attack"]')
      ?.click();
    expect(commands).toEqual([
      { type: ATTACK, payload: { attackerId: "s1", targetId: "spawner-1" } },
    ]);
  });

  it("drops a spawner target once it is destroyed", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "attack" });
    hud.handleIntent({ kind: "select-unit", unitId: "spawner-1" });
    expect(hud.getTargetUnitId()).toBe("spawner-1");
    const cleared = hudMission();
    hud.update({
      ...cleared,
      spawners: cleared.spawners.map((s) =>
        s.id === "spawner-1" ? { ...s, hp: 0, destroyed: true } : s,
      ),
    });
    expect(hud.getTargetUnitId()).toBeUndefined();
  });

  it("previews an attack from the combat service and fires it", () => {
    const { hud, commands, mission } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(hud.getMode()).toBe("attack");
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    expect(hud.getTargetUnitId()).toBe("b1");
    expect(hud.getSelectedUnitId()).toBe("s1");
    const expected = previewAttack(mission, "s1", "b1", COMBAT_TUNING);
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    expect(field("hit-chance")?.textContent).toBe(
      `${String(expected.value.hitChance)}% hit`,
    );
    expect(field("damage-range")?.textContent).toBe(
      `${String(expected.value.damage[0])}–${String(expected.value.damage[1])} damage`,
    );
    root
      .querySelector<HTMLButtonElement>('[data-action="confirm-attack"]')
      ?.click();
    expect(commands).toEqual([
      { type: ATTACK, payload: { attackerId: "s1", targetId: "b1" } },
    ]);
    expect(hud.getMode()).toBe("select");
    expect(root.querySelector<HTMLElement>("#hit-preview")?.hidden).toBe(true);
  });

  it("shows the service's refusal for an unreachable target", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "attack" });
    hud.handleIntent({ kind: "select-unit", unitId: "b2" });
    expect(
      root.querySelector<HTMLElement>('[data-role="preview-error"]')
        ?.textContent,
    ).toContain("tiles away");
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="confirm-attack"]')
        ?.disabled,
    ).toBe(true);
  });

  it("move mode sends a move on a tile, and the other actions dispatch or cycle", () => {
    const { hud, commands, mission } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "move" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 2, y: 0, z: 1 } });
    hud.handleIntent({ kind: "action", action: "overwatch" });
    hud.handleIntent({ kind: "end-turn" });
    expect(commands.map((c) => c.type)).toEqual([MOVE, OVERWATCH, END_TURN]);
    hud.handleIntent({ kind: "action", action: "next-unit" });
    expect(hud.getSelectedUnitId()).toBe("s1");
    hud.update({
      ...mission,
      units: mission.units.map((u) => (u.id === "s2" ? { ...u, ap: 2 } : u)),
    });
    hud.handleIntent({ kind: "action", action: "next-unit" });
    expect(hud.getSelectedUnitId()).toBe("s2");
    hud.handleIntent({ kind: "action", action: "cancel" });
    expect(hud.getMode()).toBe("select");
  });

  it("drops a selection that died and reports status through the banner", () => {
    const { hud, mission } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.update({
      ...mission,
      units: mission.units.map((u) => (u.id === "s1" ? { ...u, hp: 0 } : u)),
    });
    expect(hud.getSelectedUnitId()).toBeUndefined();
    hud.showStatus("Rejected");
    expect(
      root.querySelector<HTMLElement>('[data-role="status"]')?.textContent,
    ).toBe("Rejected");
    hud.update(undefined);
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="end-turn"]')
        ?.disabled,
    ).toBe(true);
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { EXTRACT } from "../../tactical/model/extract-command";
import { INTERACT } from "../../tactical/model/interact-command";
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
    { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING },
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
      { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING },
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

  it("the next-target key cycles every enemy including the egg spawner (#426)", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    // The key arms attack mode itself, so the player never has to.
    hud.handleIntent({ kind: "action", action: "next-target" });
    expect(hud.getMode()).toBe("attack");
    const seen = [hud.getTargetUnitId()];
    for (let step = 0; step < 2; step++) {
      hud.handleIntent({ kind: "action", action: "next-target" });
      seen.push(hud.getTargetUnitId());
    }
    // Two living bugs and the one standing spawner, in that order.
    expect(seen).toEqual(["b1", "b2", "spawner-1"]);
    // And it wraps.
    hud.handleIntent({ kind: "action", action: "next-target" });
    expect(hud.getTargetUnitId()).toBe("b1");
  });

  it("the next-target key does nothing without a unit that can act", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "action", action: "next-target" });
    expect(hud.getTargetUnitId()).toBeUndefined();
    expect(hud.getMode()).toBe("move");
    // s2 is out of action points.
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    hud.handleIntent({ kind: "action", action: "next-target" });
    expect(hud.getTargetUnitId()).toBeUndefined();
  });

  it("a select-spawner intent targets the spawner without stealing the selection (#484)", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "attack" });
    hud.handleIntent({ kind: "select-spawner", spawnerId: "spawner-1" });
    expect(hud.getTargetUnitId()).toBe("spawner-1");
    expect(hud.getSelectedUnitId()).toBe("s1");
  });

  it("a select-spawner intent outside attack mode neither targets nor selects", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-spawner", spawnerId: "spawner-1" });
    // A spawner is never the selected unit — it has no card and no actions.
    expect(hud.getSelectedUnitId()).toBe("s1");
    expect(hud.getTargetUnitId()).toBeUndefined();
  });

  it("the toggle-range key flips the weapon-range indicator, on by default (#522)", () => {
    const { hud } = setup();
    expect(hud.isWeaponRangeVisible()).toBe(true);
    hud.handleIntent({ kind: "action", action: "toggle-range" });
    expect(hud.isWeaponRangeVisible()).toBe(false);
    hud.handleIntent({ kind: "action", action: "toggle-range" });
    expect(hud.isWeaponRangeVisible()).toBe(true);
    // It survives a change of selection: it is a view preference, not
    // per-unit state.
    hud.handleIntent({ kind: "action", action: "toggle-range" });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(hud.isWeaponRangeVisible()).toBe(false);
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
    expect(hud.getMode()).toBe("move");
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
    expect(hud.getMode()).toBe("move");
  });

  // ===========================================
  // Moving (#488)
  // ===========================================

  it("walks a unit across several tiles to a distant tile, not one step", () => {
    const { hud, commands } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "move" });
    // s1 stands at (1,0,1) with two actions of five tiles: ten steps.
    const target = { x: 8, y: 0, z: 4 };
    hud.handleIntent({ kind: "select-tile", tile: target });

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command?.type).toBe(MOVE);
    if (command?.type !== MOVE) return;
    const { path } = command.payload;
    // The whole route, not a single hop: every tile it steps through, in
    // order, ending on the tile that was clicked.
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(target);
    expect(path).toHaveLength(10);
    // Each entry is one orthogonal step on from the last, which is what
    // `move-handler` validates and what the old one-element path failed.
    let previous = { x: 1, y: 0, z: 1 };
    for (const step of path) {
      expect(
        Math.abs(step.x - previous.x) + Math.abs(step.z - previous.z),
      ).toBe(1);
      previous = step;
    }
    expect(hud.getMode()).toBe("move");
  });

  it("routes around what it cannot walk through rather than through it", () => {
    const { hud, commands, mission } = setup();
    // Line the squad up with the crate at (4,0,2) and aim past it.
    hud.update({
      ...mission,
      units: mission.units.map((u) =>
        u.id === "s1" ? { ...u, pos: { x: 1, y: 0, z: 2 } } : u,
      ),
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "move" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 6, y: 0, z: 2 } });

    expect(commands).toHaveLength(1);
    const command = commands[0];
    if (command?.type !== MOVE) throw new Error("expected a move");
    const { path } = command.payload;
    expect(path.at(-1)).toEqual({ x: 6, y: 0, z: 2 });
    // The straight line runs through the crate, so the route must not.
    expect(
      path.some((step) => step.x === 4 && step.y === 0 && step.z === 2),
    ).toBe(false);
    // Which makes it longer than the five tiles of the straight line.
    expect(path.length).toBeGreaterThan(5);
  });

  it("refuses a tile nothing can stand on, such as a crate", () => {
    const { hud, commands, mission } = setup();
    hud.update({
      ...mission,
      units: mission.units.map((u) =>
        u.id === "s1" ? { ...u, pos: { x: 3, y: 0, z: 2 } } : u,
      ),
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "move" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 4, y: 0, z: 2 } });
    expect(commands).toEqual([]);
    expect(
      root.querySelector<HTMLElement>('[data-role="status"]')?.textContent,
    ).toContain("out of reach");
  });

  it("refuses a tile out of reach, says why, and stays ready for another click", () => {
    const { hud, commands, mission } = setup();
    // One action of five tiles from (1,0,1) cannot cross the map.
    hud.update({
      ...mission,
      units: mission.units.map((u) => (u.id === "s1" ? { ...u, ap: 1 } : u)),
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "move" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 9, y: 0, z: 5 } });

    expect(commands).toEqual([]);
    expect(
      root.querySelector<HTMLElement>('[data-role="status"]')?.textContent,
    ).toContain("out of reach");
    // Still armed: the player misjudged the range, not the intent.
    expect(hud.getMode()).toBe("move");
    hud.handleIntent({ kind: "select-tile", tile: { x: 2, y: 0, z: 1 } });
    expect(commands).toHaveLength(1);
  });

  it("treats a click on the unit's own tile as a cancel, not an empty move", () => {
    const { hud, commands } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "move" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 1, y: 0, z: 1 } });
    expect(commands).toEqual([]);
    expect(hud.getMode()).toBe("move");
  });

  it("moves on a tile click with nothing armed first, Move being the default (#519)", () => {
    const { hud, commands } = setup();
    // No action chosen: select the unit, click a tile, it walks.
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(hud.getMode()).toBe("move");
    hud.handleIntent({ kind: "select-tile", tile: { x: 5, y: 0, z: 3 } });
    expect(commands.map((c) => c.type)).toEqual([MOVE]);
    // And the bar says so, so the state is legible.
    expect(
      root
        .querySelector<HTMLElement>('[data-action="move"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("ignores a tile click when the selected unit is not the player's", () => {
    const { hud, commands } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 5, y: 0, z: 3 } });
    expect(commands).toEqual([]);
  });

  it("does not move onto a tile while Attack is armed", () => {
    const { hud, commands } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(hud.getMode()).toBe("attack");
    hud.handleIntent({ kind: "select-tile", tile: { x: 5, y: 0, z: 3 } });
    expect(commands).toEqual([]);
    // Pressing the armed action again falls back to Move, not to nothing.
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(hud.getMode()).toBe("move");
  });

  it("offers Interact only when an objective is in reach, and works the nearest", () => {
    const { hud, mission, commands } = setup();
    const button = (): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>('[data-action="interact"]');

    // s1 stands at (1,0,1); the live spawner is at (9,0,0).
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(button()?.disabled).toBe(true);
    hud.handleIntent({ kind: "action", action: "interact" });
    expect(commands).toEqual([]);

    // Put two spawners in reach; the nearer one gets the charges.
    hud.update({
      ...mission,
      spawners: [
        {
          ...mission.spawners[0]!,
          id: "spawner-far",
          pos: { x: 2, y: 0, z: 2 },
        },
        {
          ...mission.spawners[0]!,
          id: "spawner-near",
          pos: { x: 1, y: 0, z: 2 },
        },
      ],
      objectives: [
        {
          id: "objective-far",
          kind: "destroy-spawner",
          targetId: "spawner-far",
          complete: false,
        },
        {
          id: "objective-near",
          kind: "destroy-spawner",
          targetId: "spawner-near",
          complete: false,
        },
      ],
    });
    expect(button()?.disabled).toBe(false);
    button()?.click();
    expect(commands).toEqual([
      {
        type: INTERACT,
        payload: { unitId: "s1", objectiveId: "objective-near" },
      },
    ]);
  });

  it("marks the objective Interact would work, so two in range are not ambiguous", () => {
    const { hud, mission } = setup();
    hud.update({
      ...mission,
      spawners: [{ ...mission.spawners[0]!, pos: { x: 1, y: 0, z: 2 } }],
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    const row = root.querySelector<HTMLElement>(
      '[data-role="objective-list"] [data-objective-id="objective-1"]',
    );
    expect(row?.dataset.inReach).toBe("true");
    expect(row?.textContent).toContain("in reach");

    // Nothing selected, nothing in reach.
    hud.handleIntent({ kind: "action", action: "cancel" });
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    expect(
      root.querySelector<HTMLElement>(
        '[data-role="objective-list"] [data-objective-id="objective-1"]',
      )?.dataset.inReach,
    ).toBeUndefined();
  });

  it("never offers Interact to a spent unit or for a finished objective", () => {
    const { hud, mission } = setup();
    const adjacent = {
      ...mission,
      spawners: [{ ...mission.spawners[0]!, pos: { x: 1, y: 0, z: 4 } }],
    };
    // s2 is beside the spawner but has no action points left.
    hud.update(adjacent);
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="interact"]')
        ?.disabled,
    ).toBe(true);

    // Give it actions but finish the objective: still nothing to work.
    hud.update({
      ...adjacent,
      units: adjacent.units.map((u) => (u.id === "s2" ? { ...u, ap: 2 } : u)),
      objectives: adjacent.objectives.map((o) => ({ ...o, complete: true })),
    });
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="interact"]')
        ?.disabled,
    ).toBe(true);
  });

  it("offers Extract only to a unit standing in the extraction zone", () => {
    const { hud, mission, commands } = setup();
    const button = (): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>('[data-action="extract"]');

    // s1 stands at (1,0,1); the zone is (0,0,0).
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(button()?.disabled).toBe(true);
    hud.handleIntent({ kind: "action", action: "extract" });
    expect(commands).toEqual([]);

    hud.update({ ...mission, extraction: [{ x: 1, y: 0, z: 1 }] });
    expect(button()?.disabled).toBe(false);
    button()?.click();
    expect(commands).toEqual([{ type: EXTRACT, payload: { unitId: "s1" } }]);
  });

  it("offers Extract to a unit that has spent its turn, since walking out is free", () => {
    const { hud, mission } = setup();
    // s2 is on the zone with no action points left.
    hud.update({ ...mission, extraction: [{ x: 1, y: 0, z: 3 }] });
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="extract"]')
        ?.disabled,
    ).toBe(false);
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="overwatch"]')
        ?.disabled,
    ).toBe(true);
  });

  it("never offers Extract to the other side's unit", () => {
    const { hud, mission } = setup();
    hud.update({ ...mission, extraction: [{ x: 4, y: 0, z: 1 }] });
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="extract"]')
        ?.disabled,
    ).toBe(true);
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

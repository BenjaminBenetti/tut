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
import { hudMission, hudTemplate, hudUnit } from "./mission-hud.test-helper";
import { TacticalHudView } from "./tactical-hud-view";
import { withVision } from "../../tactical/service/vision-service";
import type { TurnStartedEvent } from "../../tactical/model/turn-started-event";
import { TURN_STARTED } from "../../tactical/model/turn-started-event";
import type { TacticalState } from "../../tactical/model/tactical-state";

let root: HTMLElement;
const field = (name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-field="${name}"]`);

/** The display name the player sees for a unit, from the mission's templates. */
function nameOfUnit(mission: TacticalState, unitId: string): string {
  const unit = mission.units.find((candidate) => candidate.id === unitId);
  const template = unit ? mission.templates[unit.templateId] : undefined;
  const name = template?.name;
  if (name === undefined) {
    throw new Error(`fixture unit ${unitId} has no template name`);
  }
  return name;
}

function setup(
  extra: {
    onLookAt?: (unitId: string) => void;
    onNotice?: (unitId: string, text: string) => void;
    onMarkTile?: (
      tile: { x: number; y: number; z: number } | undefined,
    ) => void;
    headAnchorFor?: (unitId: string) => { x: number; y: number } | undefined;
  } = {},
) {
  const commands: TacticalCommand[] = [];
  const onBack = vi.fn();
  const hud = new TacticalHudView(
    {
      onCommand: (c) => commands.push(c),
      onBack,
      // An anchor, so the wheel can open: without one a left click on a
      // tile or an enemy opens nothing and half the HUD is untestable.
      anchorFor: () => ({ x: 100, y: 100 }),
      ...extra,
    },
    { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING },
  );
  hud.mount(root);
  const mission = hudMission();
  hud.update(mission);
  return { hud, commands, mission, onBack };
}

/** The wheel entry with this id, or null while the wheel is closed. */
const item = (id: string): HTMLButtonElement | null =>
  root.querySelector<HTMLButtonElement>(
    `#radial-menu button[data-item="${id}"]`,
  );

/** Every entry id on the open wheel, in ring order. */
const items = (): string[] =>
  [...root.querySelectorAll<HTMLElement>("#radial-menu button[data-item]")].map(
    (button) => button.dataset.item ?? "",
  );

/** True while the wheel is on screen. */
const wheelOpen = (): boolean =>
  root.querySelector<HTMLElement>("#radial-menu")?.dataset.open === "true";

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
});

/**
 * A mission whose `m1` carries two weapons of different reach, so the
 * armed one is observable: the short gun cannot touch `b2` eleven tiles
 * away and the long one can.
 */
function twoWeaponMission() {
  const base = hudMission();
  const template = {
    ...hudTemplate("mech", "Hammerhead"),
    weapons: [
      {
        id: "arm-weapon",
        name: "Autocannon",
        profile: { range: 8, accuracy: 65, damage: 10, armorPen: 0 },
      },
      {
        id: "back-weapon",
        name: "Missile Pod",
        profile: { range: 12, accuracy: 55, damage: 22, armorPen: 1 },
      },
    ],
  };
  return withVision({
    state: {
      ...base,
      units: [...base.units, hudUnit("m1", "tdf", "mech", 1, 1)],
      templates: { ...base.templates, mech: template },
    },
    events: [],
  }).state;
}

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

  it("selecting a unit fills the card; clicking it again opens its wheel (#1112)", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(hud.getSelectedUnitId()).toBe("s1");
    expect(field("unit-name")?.textContent).toBe("Rifle Squad");
    // A click on a friendly unit selects it and opens nothing.
    expect(wheelOpen()).toBe(false);
    // A second click on the selected unit asks what it can do here.
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(wheelOpen()).toBe(true);
    expect(item("overwatch")?.disabled).toBe(false);
    // Another friendly unit switches the selection and closes the wheel.
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    expect(hud.getSelectedUnitId()).toBe("s2");
    expect(wheelOpen()).toBe(false);
    // A spent unit still gets a wheel, with every entry saying why not.
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    expect(item("overwatch")?.disabled).toBe(true);
    expect(item("overwatch")?.title).toContain("no action points");
    // With a squad selected, a bug is a target, not a selection.
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    expect(hud.getSelectedUnitId()).toBe("s2");
    expect(hud.getTargetUnitId()).toBe("b1");
    expect(wheelOpen()).toBe(true);
    expect(item("attack:b1")?.disabled).toBe(true);
  });

  it("a bug can be selected to read its card when nothing of the player's is", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    expect(hud.getSelectedUnitId()).toBe("b1");
    expect(field("unit-side")?.textContent).toBe("bugs · bug");
    expect(wheelOpen()).toBe(false);
  });

  it("a left click on an enemy aims at it and opens the wheel with Attack first (#1112)", () => {
    const { hud, commands, mission } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    // Aiming: the target is previewed and the envelope is drawn, as the
    // keyboard's Attack does, so the map explains the ring.
    expect(hud.getSelectedUnitId()).toBe("s1");
    expect(hud.getTargetUnitId()).toBe("b1");
    expect(hud.getMode()).toBe("attack");
    expect(items()[0]).toBe("attack:b1");
    const expected = previewAttack(mission, "s1", "b1", COMBAT_TUNING);
    if (!expected.ok) throw new Error("fixture shot must be legal");
    expect(field("hub-value")?.textContent).toBe(
      `${String(expected.value.hitChance)}%`,
    );
    // One weapon: the entry is the shot.
    item("attack:b1")?.click();
    expect(commands).toEqual([
      { type: ATTACK, payload: { attackerId: "s1", targetId: "b1" } },
    ]);
    expect(wheelOpen()).toBe(false);
    expect(hud.getMode()).toBe("move");
  });

  it("Attack on a unit with several weapons turns to a weapon page, and Back turns back (#1112)", () => {
    const commands: TacticalCommand[] = [];
    const hud = new TacticalHudView(
      {
        onCommand: (c) => commands.push(c),
        onBack: vi.fn(),
        anchorFor: () => ({ x: 100, y: 100 }),
      },
      { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING },
    );
    hud.mount(root);
    hud.update(twoWeaponMission());
    hud.handleIntent({ kind: "select-unit", unitId: "m1" });
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    expect(items()[0]).toBe("attack:b1");
    item("attack:b1")?.click();
    // The page turned rather than firing: one entry per weapon, a way back.
    expect(wheelOpen()).toBe(true);
    expect(items()).toEqual([
      "attack:b1:arm-weapon",
      "attack:b1:back-weapon",
      "back:b1",
    ]);
    expect(commands).toEqual([]);
    item("back:b1")?.click();
    expect(items()[0]).toBe("attack:b1");
    item("attack:b1")?.click();
    item("attack:b1:back-weapon")?.click();
    expect(commands).toEqual([
      {
        type: ATTACK,
        payload: { attackerId: "m1", targetId: "b1", weaponId: "back-weapon" },
      },
    ]);
    expect(wheelOpen()).toBe(false);
  });

  it("a press outside an aiming wheel closes the ring and keeps the aim, so the panel's Fire still works (#1112)", () => {
    const { hud, commands } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    expect(hud.getMode()).toBe("attack");
    // The press that dismisses the ring is the press on Fire: pointerdown
    // reaches the document first, then the click lands on the button.
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(wheelOpen()).toBe(false);
    expect(hud.getMode()).toBe("attack");
    expect(hud.getTargetUnitId()).toBe("b1");
    root
      .querySelector<HTMLButtonElement>('[data-action="confirm-attack"]')
      ?.click();
    expect(commands).toEqual([
      { type: ATTACK, payload: { attackerId: "s1", targetId: "b1" } },
    ]);
    // Cancel is what clears the aim, as it always did.
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    hud.handleIntent({ kind: "action", action: "cancel" });
    expect(wheelOpen()).toBe(false);
    expect(hud.getMode()).toBe("move");
    expect(hud.getTargetUnitId()).toBeUndefined();
  });

  it("a left click on a tile opens the wheel with Move, and Move walks (#1112)", () => {
    const { hud, commands } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 3, y: 0, z: 1 } });
    expect(items()).toEqual(["move:3,0,1", "overwatch", "reload"]);
    expect(commands).toEqual([]);
    item("move:3,0,1")?.click();
    expect(commands.map((c) => c.type)).toEqual([MOVE]);
    expect(wheelOpen()).toBe(false);
  });

  it("a tile out of reach still gets a wheel, with Move closed and the reason on it", () => {
    const { hud, mission } = setup();
    hud.update({
      ...mission,
      units: mission.units.map((u) => (u.id === "s1" ? { ...u, ap: 1 } : u)),
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 9, y: 0, z: 5 } });
    expect(item("move:9,0,5")?.disabled).toBe(true);
    expect(item("move:9,0,5")?.textContent).toContain("out of reach");
  });

  it("frames the wheel's tile on the map while it is open, and clears it after (#1113 review)", () => {
    const marked: (string | undefined)[] = [];
    const { hud, mission } = setup({
      onMarkTile: (tile) => {
        marked.push(
          tile === undefined
            ? undefined
            : `${String(tile.x)},${String(tile.y)},${String(tile.z)}`,
        );
      },
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 3, y: 0, z: 1 } });
    expect(marked.at(-1)).toBe("3,0,1");
    // An enemy's wheel frames the enemy's tile.
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    const b1 = mission.units.find((u) => u.id === "b1");
    expect(marked.at(-1)).toBe(
      `${String(b1?.pos.x)},${String(b1?.pos.y)},${String(b1?.pos.z)}`,
    );
    hud.handleIntent({ kind: "action", action: "cancel" });
    expect(marked.at(-1)).toBeUndefined();
  });

  it("shows a status chip above every visible unit while Shift is held, and none after (#1113 review)", () => {
    const { hud, mission } = setup({
      headAnchorFor: (unitId) => ({ x: unitId.length * 10, y: 50 }),
    });
    const layer = (): HTMLElement | null =>
      root.querySelector<HTMLElement>("#unit-status-layer");
    const chips = (): HTMLElement[] => [
      ...root.querySelectorAll<HTMLElement>(".tut-status-chip"),
    ];
    expect(layer()?.hidden).toBe(true);
    hud.handleIntent({ kind: "inspect", held: true });
    expect(layer()?.hidden).toBe(false);
    // Every living unit the player can see: the fixture's two squads and
    // the bugs a real look from where they stand has spotted.
    const visible = mission.units.filter(
      (u) =>
        u.hp > 0 &&
        (u.team === "tdf" || mission.vision.tdf.spotted.includes(u.id)),
    );
    expect(
      chips()
        .map((c) => c.dataset.unitId)
        .sort(),
    ).toEqual(visible.map((u) => u.id).sort());
    const s2 = chips().find((c) => c.dataset.unitId === "s2");
    expect(
      s2?.querySelector<HTMLElement>('[data-field="status-name"]')?.textContent,
    ).toBe("Rifle Squad");
    // 12 of 20 hit points: a 60% bar, still in the ok tone.
    const fill = s2?.querySelector<HTMLElement>('[data-field="status-hp"]');
    expect(fill?.style.width).toBe("60%");
    expect(fill?.dataset.tone).toBe("ok");
    // The numbers after the bar; no pool on the fixture's rifles, so no
    // gauge line.
    expect(
      s2?.querySelector<HTMLElement>('[data-field="status-hp-text"]')
        ?.textContent,
    ).toBe("12 / 20");
    expect(
      s2?.querySelector<HTMLElement>('[data-field="status-charges"]')?.hidden,
    ).toBe(true);
    expect(s2?.style.left).toBe("20px");
    // The chips follow the state: a unit that dies loses its chip.
    hud.update({
      ...mission,
      units: mission.units.map((u) => (u.id === "s2" ? { ...u, hp: 0 } : u)),
    });
    expect(chips().some((c) => c.dataset.unitId === "s2")).toBe(false);
    hud.handleIntent({ kind: "inspect", held: false });
    expect(layer()?.hidden).toBe(true);
    expect(chips()).toHaveLength(0);
  });

  it("names every pooled weapon's gauge in the unit's register on its chip", () => {
    const { hud, mission } = setup({
      headAnchorFor: () => ({ x: 0, y: 0 }),
    });
    const s1 = mission.units.find((u) => u.id === "s1");
    const template = s1 && mission.templates[s1.templateId];
    if (!s1 || !template) throw new Error("fixture needs s1");
    const first = template.weapons[0];
    if (!first) throw new Error("fixture weapon");
    const rifle = { ...first, id: "rifle", name: "Rifle", charges: 3 };
    const launcher = {
      ...first,
      id: "launcher",
      name: "Launcher",
      charges: 2,
    };
    // And one with no pool, which gets no line.
    const knife = { ...first, id: "knife", name: "Knife" };
    hud.update({
      ...mission,
      templates: {
        ...mission.templates,
        [s1.templateId]: { ...template, weapons: [rifle, knife, launcher] },
      },
      units: mission.units.map((u) =>
        u.id === "s1" ? { ...u, charges: { rifle: 1, launcher: 2 } } : u,
      ),
    });
    hud.handleIntent({ kind: "inspect", held: true });
    const lines = [
      ...root.querySelectorAll<HTMLElement>(
        '.tut-status-chip[data-unit-id="s1"] [data-field="status-charge"]',
      ),
    ].map((row) => row.textContent);
    expect(lines).toEqual(["Rifle · ammo 1 / 3", "Launcher · ammo 2 / 2"]);
  });

  it("a tile click by a unit that is not the player's opens nothing", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 5, y: 0, z: 3 } });
    expect(wheelOpen()).toBe(false);
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

  it("a select-spawner intent with nothing armed aims at the spawner and opens the wheel (#1112)", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-spawner", spawnerId: "spawner-1" });
    // A spawner is never the selected unit — it has no card and no actions.
    expect(hud.getSelectedUnitId()).toBe("s1");
    expect(hud.getTargetUnitId()).toBe("spawner-1");
    expect(items()[0]).toBe("attack:spawner-1");
  });

  it("shows the weapon range while Attack is armed, and not on plain selection (#590)", () => {
    const { hud } = setup();
    expect(hud.isWeaponRangeVisible()).toBe(false);
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    // Selecting a unit asks "where can I go?", not "how far do I shoot?".
    expect(hud.isWeaponRangeVisible()).toBe(false);
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(hud.isWeaponRangeVisible()).toBe(true);
    // Disarming puts it away again.
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(hud.isWeaponRangeVisible()).toBe(false);
  });

  it("the toggle-range key pins the weapon range up regardless of mode (#522, #590)", () => {
    const { hud } = setup();
    hud.handleIntent({ kind: "action", action: "toggle-range" });
    expect(hud.isWeaponRangeVisible()).toBe(true);
    // It survives a change of selection: it is a view preference, not
    // per-unit state.
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(hud.isWeaponRangeVisible()).toBe(true);
    // Arming and disarming Attack must not silently unpin it, which is
    // why the pin is kept apart from the mode rather than sharing a flag.
    hud.handleIntent({ kind: "action", action: "attack" });
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(hud.isWeaponRangeVisible()).toBe(true);
    hud.handleIntent({ kind: "action", action: "toggle-range" });
    expect(hud.isWeaponRangeVisible()).toBe(false);
  });

  it("reports a view change when armed intent moves, so the scene can restyle (#590)", () => {
    const changes: number[] = [];
    const hud = new TacticalHudView(
      {
        onCommand: vi.fn(),
        onBack: vi.fn(),
        onViewChange: () => changes.push(1),
      },
      { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING },
    );
    hud.mount(root);
    hud.update(hudMission());
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    const afterSelect = changes.length;
    expect(afterSelect).toBeGreaterThan(0);
    // Arming Attack changes nothing the scene could learn from an
    // intent of its own, so without this the envelope never appears.
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(changes.length).toBeGreaterThan(afterSelect);
    hud.unmount();
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

  it("previews the weapon that is armed, not the unit's first (#532)", () => {
    const commands: TacticalCommand[] = [];
    const hud = new TacticalHudView(
      { onCommand: (c) => commands.push(c), onBack: vi.fn() },
      { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING },
    );
    hud.mount(root);
    const mission = twoWeaponMission();
    hud.update(mission);

    // b2 is eleven tiles off: past the autocannon, inside the pod.
    hud.handleIntent({ kind: "select-unit", unitId: "m1" });
    hud.handleIntent({ kind: "action", action: "attack" });
    hud.handleIntent({ kind: "select-unit", unitId: "b2" });
    expect(
      root.querySelector<HTMLElement>('[data-role="preview-error"]')
        ?.textContent,
    ).toContain("tiles away");

    // Pressing Attack again cycles to the missile pod. If the preview
    // still asked the combat service about the autocannon it would go on
    // refusing a shot the trigger would happily take — which is exactly
    // what stalled tactical-objective-destroyed.
    hud.handleIntent({ kind: "action", action: "attack" });
    const expected = previewAttack(
      mission,
      "m1",
      "b2",
      COMBAT_TUNING,
      "back-weapon",
    );
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    expect(field("hit-chance")?.textContent).toBe(
      `${String(expected.value.hitChance)}% hit`,
    );
    expect(field("damage-range")?.textContent).toBe(
      `${String(expected.value.damage[0])}\u2013${String(expected.value.damage[1])} damage`,
    );

    // And what it fires is what it previewed.
    root
      .querySelector<HTMLButtonElement>('[data-action="confirm-attack"]')
      ?.click();
    expect(commands).toEqual([
      {
        type: ATTACK,
        payload: {
          attackerId: "m1",
          targetId: "b2",
          weaponId: "back-weapon",
        },
      },
    ]);
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
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 2, y: 0, z: 1 } },
    });
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
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: target },
    });

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
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 6, y: 0, z: 2 } },
    });

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
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 4, y: 0, z: 2 } },
    });
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
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 9, y: 0, z: 5 } },
    });

    expect(commands).toEqual([]);
    expect(
      root.querySelector<HTMLElement>('[data-role="status"]')?.textContent,
    ).toContain("out of reach");
    // Still armed: the player misjudged the range, not the intent.
    expect(hud.getMode()).toBe("move");
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 2, y: 0, z: 1 } },
    });
    expect(commands).toHaveLength(1);
  });

  it("treats a click on the unit's own tile as a cancel, not an empty move", () => {
    const { hud, commands } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "move" });
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 1, y: 0, z: 1 } },
    });
    expect(commands).toEqual([]);
    expect(hud.getMode()).toBe("move");
  });

  it("moves on a tile click with nothing armed first, Move being the default (#519)", () => {
    const { hud, commands } = setup();
    // No action chosen: select the unit, click a tile, it walks.
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(hud.getMode()).toBe("move");
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 5, y: 0, z: 3 } },
    });
    expect(commands.map((c) => c.type)).toEqual([MOVE]);
    // And no wheel: the right button commits, it never asks.
    expect(wheelOpen()).toBe(false);
  });

  it("ignores a tile click when the selected unit is not the player's", () => {
    const { hud, commands } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 5, y: 0, z: 3 } },
    });
    expect(commands).toEqual([]);
  });

  it("a right click walks even while aiming, and stops the aim (#1112)", () => {
    const { hud, commands } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(hud.getMode()).toBe("attack");
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 5, y: 0, z: 3 } },
    });
    expect(commands.map((c) => c.type)).toEqual([MOVE]);
    expect(hud.getMode()).toBe("move");
    // Pressing Attack twice arms and disarms, as it always did.
    hud.handleIntent({ kind: "action", action: "attack" });
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(hud.getMode()).toBe("move");
  });

  it("offers Interact only when an objective is in reach, and works the nearest", () => {
    const { hud, mission, commands } = setup();
    const interactItem = (): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>(
        '#radial-menu button[data-item^="interact:"]',
      );

    // s1 stands at (1,0,1); the live spawner is at (9,0,0).
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(wheelOpen()).toBe(true);
    expect(interactItem()).toBeNull();
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
    // The unit's own wheel offers the nearest one.
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(interactItem()?.dataset.item).toBe("interact:objective-near");
    // And the spawner's wheel offers it when that spawner is the one.
    hud.handleIntent({ kind: "select-spawner", spawnerId: "spawner-far" });
    expect(interactItem()).toBeNull();
    hud.handleIntent({ kind: "select-spawner", spawnerId: "spawner-near" });
    expect(interactItem()?.disabled).toBe(false);
    interactItem()?.click();
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
    const interactItem = (): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>(
        '#radial-menu button[data-item^="interact:"]',
      );
    // s2 is beside the spawner but has no action points left.
    hud.update(adjacent);
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    expect(wheelOpen()).toBe(true);
    expect(interactItem()).toBeNull();

    // Give it actions but finish the objective: still nothing to work.
    hud.update({
      ...adjacent,
      units: adjacent.units.map((u) => (u.id === "s2" ? { ...u, ap: 2 } : u)),
      objectives: adjacent.objectives.map((o) => ({ ...o, complete: true })),
    });
    expect(wheelOpen()).toBe(true);
    expect(interactItem()).toBeNull();
  });

  /**
   * The third surface that names a unit's charges, and the one nothing
   * was asserting (#1062): the bar said `Vent`, the card said `heat`,
   * and the refusal said `charges`, each deciding separately. Now all
   * three ask `chargeRegisterFor`, so this test is what stops the bar
   * drifting back — removing the split reddens the card and the refusal
   * already, but left the button label free to say anything.
   */
  it("names the reload action as the unit's own card does", () => {
    const { hud } = setup();
    // `hudUnit` derives kind from the team, so the two-weapon fixture's
    // `m1` is a mech by template and a squad by kind. The register keys
    // off kind, as the card does, so say so.
    const base = twoWeaponMission();
    hud.update({
      ...base,
      units: base.units.map((u) =>
        u.id === "m1" ? { ...u, kind: "mech" as const } : u,
      ),
    });
    const label = (): string | undefined =>
      root.querySelector<HTMLElement>(
        '#radial-menu [data-item="reload"] .tut-radial__label',
      )?.textContent ?? undefined;

    hud.handleIntent({ kind: "select-unit", unitId: "m1" });
    hud.handleIntent({ kind: "select-unit", unitId: "m1" });
    expect(label()).toBe("Vent");
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(label()).toBe("Reload");
  });

  /**
   * QA's corrected row (#1062): the Move **button** explains this
   * refusal, while the right click players actually move with says
   * nothing. `moveTo` opened with `if (!this.canAct()) return`, and
   * `canAct` is one boolean answering two questions — "this is not
   * yours to move" and "this is yours and it cannot move now". Only the
   * second is a refusal.
   *
   * The tapped bug is the control, and it is the point of the test: a
   * change that made every stray click complain would pass the first
   * half on its own.
   */
  it("a tile click by a spent unit says why; a tapped bug still says nothing", () => {
    // Id and words kept apart, so "the words carry no id" is a real
    // assertion rather than one defeated by the id this test prepended.
    const notices: string[] = [];
    const noticedUnits: string[] = [];
    const { hud, commands } = setup({
      onNotice: (unitId: string, text: string) => {
        noticedUnits.push(unitId);
        notices.push(text);
      },
    });
    // s2 is the player's own squad, on the player's own turn, with no
    // action points left. Move is armed by default (#519), so this is a
    // plain right click on the tile beside it — no button pressed.
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 2, y: 0, z: 3 } },
    });
    expect(commands).toEqual([]);
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("no action points");
    expect(notices).toHaveLength(1);
    // Above the unit that could not act, not some other one.
    expect(noticedUnits).toEqual(["s2"]);
    // Named, not id'd, like every other refusal (#1035).
    expect(notices[0]).toContain("Rifle Squad");
    expect(notices[0]).not.toContain("s2");

    // The control: a bug the player tapped to read its card never asked
    // to walk, so the same click on it stays silent. The squad has to
    // go first: with one selected, a click on a bug aims rather than
    // selects (#1112).
    notices.length = 0;
    noticedUnits.length = 0;
    const { mission } = setup();
    hud.update({
      ...mission,
      units: mission.units.map((u) => (u.id === "s2" ? { ...u, hp: 0 } : u)),
    });
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    expect(hud.getSelectedUnitId()).toBe("b1");
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 5, y: 0, z: 1 } },
    });
    expect(commands).toEqual([]);
    expect(notices).toEqual([]);
  });

  /**
   * The defect #1030 was filed for: an unavailable action used to return
   * in silence, so the player could not tell "fine" from "refused".
   *
   * The words come from `describeTacticalError` — the vocabulary the
   * rules already had — rather than a second set written beside the
   * buttons, and they go above the unit that could not act as well as to
   * the status line.
   */
  it("says why an action is refused, above the unit and in the status", () => {
    const notices: string[] = [];
    const { hud, mission } = setup({
      onNotice: (unitId: string, text: string) => {
        notices.push(`${unitId}: ${text}`);
      },
    });
    // A unit with no action points left: the wheel entry is closed with
    // the reason on it, and the key explains itself.
    hud.update({
      ...mission,
      units: mission.units.map((u) => (u.id === "s1" ? { ...u, ap: 0 } : u)),
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(item("overwatch")?.disabled).toBe(true);
    expect(item("overwatch")?.textContent).toContain("no AP");

    hud.handleIntent({ kind: "action", action: "overwatch" });
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("no action points");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("no action points");

    // Named, never id'd (#1035). The chip above the unit is the most
    // prominent place a refusal appears, so a raw id reads worse there
    // than anywhere it has appeared before. Asserted as an absence and
    // a presence: the id is gone *and* the name is there, because
    // dropping the id without gaining a name would also pass an
    // absence-only check.
    const named = nameOfUnit(mission, "s1");
    expect(notices[0]).toContain(named);
    expect(notices[0]).not.toContain('"s1"');
    expect(status?.textContent).toContain(named);
    expect(status?.textContent).not.toContain('"s1"');
  });

  /**
   * The force at a glance (#1041). Before this the interface knew the
   * squad only through whichever unit was selected, so "who still has a
   * turn" was answerable only by clicking each in turn.
   */
  it("lists the force with its readiness, and names how many have still to act", () => {
    const { hud, mission } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    const rows = () => [
      ...root.querySelectorAll<HTMLElement>('[data-role="squad-list"] li'),
    ];
    expect(rows().length).toBeGreaterThan(1);
    expect(rows()[0]?.dataset.selected).toBe("true");
    // Read against the mission rather than an assumed fixture: the row
    // marks a unit spent exactly when it has no action left.
    const apOf = new Map(mission.units.map((u) => [u.id, u.ap]));
    for (const row of rows()) {
      const ap = apOf.get(row.dataset.unitId ?? "") ?? 0;
      expect(row.dataset.spent).toBe(ap > 0 ? "false" : "true");
    }
    const count = root.querySelector<HTMLElement>(
      '[data-field="squad-unspent"]',
    );
    const ready = rows().filter((row) => row.dataset.spent === "false").length;
    expect(count?.textContent).toBe(
      ready > 0 ? `${String(ready)} to act` : "all done",
    );

    // A spent unit is marked, and the count follows it down.
    hud.update({
      ...mission,
      units: mission.units.map((u) => (u.id === "s1" ? { ...u, ap: 0 } : u)),
    });
    const spent = rows().find((row) => row.dataset.unitId === "s1");
    expect(spent?.dataset.spent).toBe("true");
    expect(count?.textContent).not.toBe(
      ready > 0 ? `${String(ready)} to act` : "all done",
    );
  });

  /**
   * Tab and a strip row are two ways to ask for a unit, and they used to
   * disagree: the row selected and centred, Tab only selected, so a
   * player cycling with Tab could land on an armed unit they could not
   * see (#1073, found by QA verifying #1041).
   *
   * Asserts the looked-at id *is* the newly selected one, so centring the
   * previous unit, or any unit, fails as well as not centring at all.
   */
  it("Tab brings the unit it selects on screen, like a strip row (#1073)", () => {
    const lookedAt: string[] = [];
    const { hud, mission } = setup({
      onLookAt: (unitId: string) => lookedAt.push(unitId),
    });
    // Two actors, so Tab has somewhere to go: the fixture's s2 starts
    // with no action points, and a spent unit is not in the cycle.
    hud.update({
      ...mission,
      units: mission.units.map((u) => (u.id === "s2" ? { ...u, ap: 2 } : u)),
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    lookedAt.length = 0;

    hud.handleIntent({ kind: "action", action: "next-unit" });
    expect(hud.getSelectedUnitId()).toBe("s2");
    expect(lookedAt).toEqual(["s2"]);

    // And again, wrapping back — each press centres the unit it lands on.
    hud.handleIntent({ kind: "action", action: "next-unit" });
    expect(hud.getSelectedUnitId()).toBe("s1");
    expect(lookedAt).toEqual(["s2", "s1"]);
  });

  it("picks a unit from the strip and brings it on screen", () => {
    const lookedAt: string[] = [];
    const { hud } = setup({
      onLookAt: (unitId: string) => lookedAt.push(unitId),
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    const other = [
      ...root.querySelectorAll<HTMLElement>('[data-role="squad-list"] li'),
    ].find((row) => row.dataset.unitId !== "s1");
    if (!other) throw new Error("fixture needs a second unit");
    const id = other.dataset.unitId ?? "";
    other.click();
    // Selected *and* recovered: the row is the affordance, so there is
    // no separate control to find.
    expect(hud.getSelectedUnitId()).toBe(id);
    expect(lookedAt).toEqual([id]);
  });

  it("names how many units are unspent on End turn rather than ending silently", () => {
    const { hud, mission } = setup();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    const button = () =>
      root.querySelector<HTMLElement>(
        '[data-action="end-turn"] .tut-btn__label',
      );
    expect(button()?.textContent).toContain("unspent");

    // Nobody left to act: the count goes, rather than reading "0 unspent".
    hud.update({
      ...mission,
      units: mission.units.map((u) => ({ ...u, ap: 0 })),
    });
    expect(button()?.textContent).toBe("End turn");
  });

  /**
   * QA reproduced this on shipped v0.2.16 (#1027 F2) and the Director
   * sharpened the acceptance from it: one card reading `AP 1 / 2`,
   * **`ATTACKS 1`** and `ammo 0 / 3` four lines apart, with the bar
   * leaving ATTACK live while it correctly dimmed INTERACT in the same
   * frame.
   *
   * Three derivations of one fact. `actingUnit` checks map, alive,
   * phase and action points; `attacksRemaining` takes only `kind` and
   * `ap`; and `weaponOptions` — which runs the rules' own
   * `refuseWeapon` — was the only one that knew about ammunition, and
   * nothing asked it.
   */
  /**
   * QA on #1067 at `578f62e`, reproduced in play: pressing the dimmed
   * Attack gave `Rifle Squad is out of ammo; reload first` beside a card
   * reading `ALPHA`, while the preview on the same head said `Alpha` —
   * the two-names-for-one-unit defect #1047 closed, back again.
   *
   * The refusal now resolves with the campaign like every other name on
   * the screen. The fixture gives `s1` a roster name that differs from
   * its template, so this cannot pass on the template by coincidence.
   */
  it("names a refusing unit by its roster name, as the card does", () => {
    const notices: string[] = [];
    const { hud, mission } = setup({
      onNotice: (_unitId: string, text: string) => {
        notices.push(text);
      },
    });
    hud.setCampaign({
      roster: { squads: [{ id: "s1", name: "Alpha" }], mechs: [] },
      overworld: { missions: [], map: { cities: [], regions: [] } },
    } as unknown as Parameters<typeof hud.setCampaign>[0]);
    const s1 = mission.units.find((unit) => unit.id === "s1");
    const template = s1 && mission.templates[s1.templateId];
    if (!s1 || !template)
      throw new Error("fixture needs a unit with a template");
    const weapon = {
      ...template.weapons[0],
      charges: 3,
    } as (typeof template.weapons)[number];
    hud.update({
      ...mission,
      templates: {
        ...mission.templates,
        [s1.templateId]: { ...template, weapons: [weapon] },
      },
      units: mission.units.map((unit) =>
        unit.id === "s1" ? { ...unit, charges: { [weapon.id]: 0 } } : unit,
      ),
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "attack" });

    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(notices).toEqual(["Alpha is out of ammo; reload first"]);
    expect(status?.textContent).toBe("Alpha is out of ammo; reload first");
    // The template name is what the defect looked like.
    expect(notices[0]).not.toContain("Rifle Squad");
  });

  it("stops offering Attack, and counting attacks, when the magazine is empty", () => {
    const notices: string[] = [];
    const { hud, mission } = setup({
      onNotice: (_unitId: string, text: string) => {
        notices.push(text);
      },
    });
    const s1 = mission.units.find((unit) => unit.id === "s1");
    const template = s1 && mission.templates[s1.templateId];
    if (!s1 || !template)
      throw new Error("fixture needs a unit with a template");
    const weapon = {
      ...template.weapons[0],
      charges: 3,
    } as (typeof template.weapons)[number];
    const withAmmo = (left: number) => ({
      ...mission,
      templates: {
        ...mission.templates,
        [s1.templateId]: { ...template, weapons: [weapon] },
      },
      units: mission.units.map((unit) =>
        unit.id === "s1" ? { ...unit, charges: { [weapon.id]: left } } : unit,
      ),
    });
    const attacks = () =>
      root.querySelector<HTMLElement>('[data-field="attacks"]')?.textContent;

    // Loaded: the control, so this cannot pass by always refusing.
    hud.update(withAmmo(3));
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    expect(item("attack:b1")?.disabled).toBe(false);
    expect(Number(attacks())).toBeGreaterThan(0);

    // Empty: the entry closes with the reason on it, and the card stops
    // advertising a shot the unit cannot take. The wheel is still open
    // on the bug, re-drawn against the new state.
    hud.update(withAmmo(0));
    expect(item("attack:b1")?.disabled).toBe(true);
    expect(item("attack:b1")?.textContent).toContain("empty");
    expect(attacks()).toBe("0");

    // ...and pressing it says why, in the register the card uses.
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("out of ammo");
    // A squad has no vent action, so the refusal must not offer one.
    expect(notices[0]).not.toContain("vent");
    expect(notices[0]).not.toContain("charges");
  });

  /**
   * Found by eng-5 on `6a552d6` and handed to this ticket: the bar
   * offered Reload to a mech at heat 4/4, and the player learned it was
   * not on offer by pressing it.
   *
   * The bar now asks the same question the command answers —
   * `reloadPools`, which the handler uses too — so the button and the
   * rule cannot disagree about whether there is anything to reload.
   */
  it("does not offer Reload to a unit whose pools are already full", () => {
    const notices: string[] = [];
    const { hud, mission } = setup({
      onNotice: (unitId: string, text: string) => {
        notices.push(`${unitId}: ${text}`);
      },
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    const reload = () => item("reload");
    // The fixture starts every pool full, which is the reported case.
    expect(reload()?.disabled).toBe(true);

    hud.handleIntent({ kind: "action", action: "reload" });
    expect(notices).toHaveLength(1);
    // This fixture's squad carries no pool at all, so the honest reason
    // is "nothing to reload" rather than "already full". Asserted as the
    // reason the rules give, not as the one I expected: the first
    // version of this test guessed `charges-full` and was wrong about
    // the fixture rather than about the behaviour.
    expect(notices[0]).toContain("nothing to reload");
    // Named, not id'd, like every other refusal.
    expect(notices[0]).not.toContain('"s1"');

    // Give the unit a pool and empty it, and the offer comes back — so
    // the button is following the rule rather than always refusing.
    const s1 = mission.units.find((unit) => unit.id === "s1");
    if (!s1) throw new Error("fixture needs a unit");
    const template = mission.templates[s1.templateId];
    if (!template) throw new Error("fixture unit has no template");
    const weapon = {
      ...template.weapons[0],
      charges: 3,
    } as (typeof template.weapons)[number];
    hud.update({
      ...mission,
      templates: {
        ...mission.templates,
        [s1.templateId]: { ...template, weapons: [weapon] },
      },
      units: mission.units.map((unit) =>
        unit.id === "s1" ? { ...unit, charges: { [weapon.id]: 0 } } : unit,
      ),
    });
    // The key closed the wheel; open it again on the unit.
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(reload()?.disabled).toBe(false);

    // ...and full again, it is not on offer.
    hud.update({
      ...mission,
      templates: {
        ...mission.templates,
        [s1.templateId]: { ...template, weapons: [weapon] },
      },
      units: mission.units.map((unit) =>
        unit.id === "s1" ? { ...unit, charges: { [weapon.id]: 3 } } : unit,
      ),
    });
    expect(reload()?.disabled).toBe(true);
  });

  it("offers Board on the drop ship's tiles, open only to a unit standing on the zone (#1112)", () => {
    const { hud, mission, commands } = setup();

    // s1 stands at (1,0,1); the zone is (0,0,0). Clicking the zone from
    // beside it offers boarding, closed, with the reason on it — and
    // Move, which is how to get there.
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 0, y: 0, z: 0 } });
    expect(items()).toEqual(["move:0,0,0", "extract", "overwatch", "reload"]);
    expect(item("extract")?.disabled).toBe(true);
    expect(item("extract")?.textContent).toContain("not on the ramp");
    // A tile that is not the ship offers no boarding at all.
    hud.handleIntent({ kind: "select-tile", tile: { x: 3, y: 0, z: 3 } });
    expect(item("extract")).toBeNull();
    hud.handleIntent({ kind: "action", action: "extract" });
    expect(commands).toEqual([]);

    // Standing on the zone, the unit's own wheel boards.
    hud.update({ ...mission, extraction: [{ x: 1, y: 0, z: 1 }] });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    expect(item("extract")?.disabled).toBe(false);
    item("extract")?.click();
    expect(commands).toEqual([{ type: EXTRACT, payload: { unitId: "s1" } }]);
  });

  it("offers Board under the aircraft itself, not only on the boarding tiles (#1112)", () => {
    const { hud, mission } = setup();
    hud.update({
      ...mission,
      map: {
        ...mission.map,
        dropships: [
          {
            deployZoneId: "deploy-1",
            footprint: { x: 6, z: 3, w: 3, d: 2 },
            clearance: { x: 5, z: 2, w: 5, d: 4 },
            level: 0,
            facing: "n",
          },
        ],
      },
    });
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 7, y: 0, z: 4 } });
    expect(item("extract")).not.toBeNull();
  });

  it("offers Board to a unit that has spent its turn, since walking out is free", () => {
    const { hud, mission } = setup();
    // s2 is on the zone with no action points left.
    hud.update({ ...mission, extraction: [{ x: 1, y: 0, z: 3 }] });
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    expect(item("extract")?.disabled).toBe(false);
    expect(item("overwatch")?.disabled).toBe(true);
  });

  it("gives the other side's unit no wheel at all", () => {
    const { hud, mission } = setup();
    hud.update({ ...mission, extraction: [{ x: 4, y: 0, z: 1 }] });
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    hud.handleIntent({ kind: "select-unit", unitId: "b1" });
    expect(wheelOpen()).toBe(false);
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
      root
        .querySelector<HTMLButtonElement>('[data-action="end-turn"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
  });
});
// ===========================================
// Fog of war (#531)
// ===========================================

describe("TacticalHudView under fog", () => {
  it("neither counts nor cycles onto an enemy the player has never seen", () => {
    const { hud, mission } = setup();
    // Short-sighted squads on the same board: the bugs are three tiles
    // and more away, so a real vision pass spots none of them. The map
    // is too small to walk out of a twelve-tile sight radius.
    const shortSighted = {
      ...mission,
      templates: Object.fromEntries(
        Object.entries(mission.templates).map(([id, t]) => [
          id,
          { ...t, sightRange: 1 },
        ]),
      ),
    };
    const far = withVision({ state: shortSighted, events: [] }).state;
    expect(far.vision.tdf.spotted).toEqual([]);
    hud.update(far);

    // The banner counts what the player knows about, not what exists.
    expect(
      far.units.filter((u) => u.team === "bugs" && u.hp > 0).length,
    ).toBeGreaterThan(0);
    expect(
      root.querySelector('#turn-banner [data-field="bug-units"]')?.textContent,
    ).toBe("0");

    // And next-target never lands on one of them.
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    const reached: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      hud.handleIntent({ kind: "action", action: "next-target" });
      reached.push(hud.getTargetUnitId());
    }
    for (const id of reached) {
      expect(far.units.some((u) => u.id === id && u.team === "bugs")).toBe(
        false,
      );
    }
  });

  it("counts and cycles onto an enemy once it has been seen", () => {
    const { hud, mission } = setup();
    hud.update(mission);
    expect(mission.vision.tdf.spotted.length).toBeGreaterThan(0);
    expect(
      root.querySelector('#turn-banner [data-field="bug-units"]')?.textContent,
    ).toBe(String(mission.vision.tdf.spotted.length));

    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "action", action: "next-target" });
    expect(mission.vision.tdf.spotted).toContain(hud.getTargetUnitId());
  });
});

describe("the context menu closes after it is used (#627)", () => {
  /** A HUD whose scene answers where things are, so the menu can open. */
  function withMenu() {
    const commands: TacticalCommand[] = [];
    const hud = new TacticalHudView(
      {
        onCommand: (c) => commands.push(c),
        onBack: vi.fn(),
        // Without an anchor the menu never opens and a test of its
        // dismissal silently proves nothing.
        anchorFor: () => ({ x: 100, y: 100 }),
      },
      { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING },
    );
    hud.mount(root);
    const mission = hudMission();
    hud.update(mission);
    return { hud, commands, mission };
  }

  /** The radial menu's root. */
  const ring = (): HTMLElement | null =>
    root.querySelector<HTMLElement>(".tut-radial");

  it("opens on a left click on a tile", () => {
    const { hud } = withMenu();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 2, y: 0, z: 1 } });

    expect(ring()?.hidden).toBe(false);
  });

  it("hides itself once an entry is chosen, rather than stranding it on the map", () => {
    const { hud } = withMenu();
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    hud.handleIntent({ kind: "select-tile", tile: { x: 2, y: 0, z: 1 } });
    expect(ring()?.hidden).toBe(false);

    root.querySelector<HTMLButtonElement>("button[data-item]")?.click();

    // The view reports the choice but does not hide itself, so the HUD
    // has to — otherwise the ring sits on the map offering an action
    // that has already happened.
    expect(ring()?.hidden).toBe(true);
  });
});
// ===========================================
// Moving on from the menu (#627)
// ===========================================

describe("the context menu closes when the player moves on (#627)", () => {
  /** A HUD with an anchor and a unit selected. */
  function armed() {
    const commands: TacticalCommand[] = [];
    const hud = new TacticalHudView(
      {
        onCommand: (c) => commands.push(c),
        onBack: vi.fn(),
        anchorFor: () => ({ x: 100, y: 100 }),
      },
      { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING },
    );
    hud.mount(root);
    const mission = hudMission();
    hud.update(mission);
    hud.handleIntent({ kind: "select-unit", unitId: "s1" });
    return { hud, commands, mission };
  }

  const isOpen = (): boolean =>
    root.querySelector<HTMLElement>("#radial-menu")?.dataset.open === "true";
  const openOnTile = (hud: TacticalHudView): void => {
    hud.handleIntent({ kind: "select-tile", tile: { x: 2, y: 0, z: 1 } });
  };

  // The three rows of QA's dismissal table that choosing an entry,
  // Escape and an outside click do not cover. The ring belongs to one
  // decision; each of these is the player starting a different one.

  it("closes when another unit is selected", () => {
    const { hud } = armed();
    openOnTile(hud);
    expect(isOpen()).toBe(true);
    hud.handleIntent({ kind: "select-unit", unitId: "s2" });
    expect(isOpen()).toBe(false);
  });

  it("closes when another action is armed", () => {
    const { hud } = armed();
    openOnTile(hud);
    expect(isOpen()).toBe(true);
    hud.handleIntent({ kind: "action", action: "attack" });
    expect(isOpen()).toBe(false);
  });

  it("closes on a right click, which walks instead of asking", () => {
    const { hud, commands } = armed();
    openOnTile(hud);
    expect(isOpen()).toBe(true);
    hud.handleIntent({
      kind: "invoke",
      target: { kind: "tile", tile: { x: 3, y: 0, z: 1 } },
    });
    expect(isOpen()).toBe(false);
    expect(commands.map((c) => c.type)).toEqual([MOVE]);
  });

  it("closes when the turn is ended", () => {
    const { hud } = armed();
    openOnTile(hud);
    expect(isOpen()).toBe(true);
    hud.handleIntent({ kind: "end-turn" });
    expect(isOpen()).toBe(false);
  });

  it("does not offer a stale action after the unit has acted", () => {
    const { hud, commands, mission } = armed();
    openOnTile(hud);
    root.querySelector<HTMLButtonElement>("button[data-item]")?.click();
    expect(commands.map((c) => c.type)).toEqual([MOVE]);

    // The unit now stands where the ring was offering to send it. While
    // the ring stayed open this is the click QA saw do nothing, because
    // the path to a tile you are already on is empty.
    hud.update({
      ...mission,
      units: mission.units.map((u) =>
        u.id === "s1" ? { ...u, pos: { x: 2, y: 0, z: 1 }, ap: 1 } : u,
      ),
    });
    expect(isOpen()).toBe(false);
  });
});

// ===========================================
// The event log on arrival
// ===========================================

/**
 * The lines currently in the event log panel, oldest first, with the
 * repeat count spelled out.
 *
 * The panel collapses consecutive identical lines into one row and
 * counts them (#525), so a line appended twice looks exactly like a line
 * appended once unless the count is read as well — which is the whole
 * difference between replaying a log and duplicating it.
 */
function logLines(): string[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      '[data-role="event-log-list"] [data-text]',
    ),
  ].map((row) => {
    const repeat = Number(row.dataset.repeat ?? "1");
    return repeat > 1
      ? `${row.dataset.text ?? ""} ×${repeat}`
      : (row.dataset.text ?? "");
  });
}

/** A HUD mounted but not yet shown a mission. */
function bareHud(): TacticalHudView {
  const hud = new TacticalHudView(
    { onCommand: vi.fn(), onBack: vi.fn() },
    { combatTuning: COMBAT_TUNING, objectiveTuning: OBJECTIVE_TUNING },
  );
  hud.mount(root);
  return hud;
}

const turnStarted = (
  turn: number,
  phase: "player" | "bugs",
): TurnStartedEvent => ({
  type: TURN_STARTED,
  payload: { turn, phase },
});

describe("the event log on arrival (#573)", () => {
  it("says what the mission opened on, before the player has done anything", () => {
    bareHud().update(hudMission({ turn: 1, log: [turnStarted(1, "player")] }));
    // No command has been dispatched, so there is no event batch to
    // append: this line can only have come from the mission's own log.
    expect(logLines()).toEqual(["Turn 1 — TDF phase"]);
  });

  it("replays a resumed mission's whole log instead of starting blank", () => {
    bareHud().update(
      hudMission({
        turn: 3,
        log: [
          turnStarted(1, "player"),
          turnStarted(1, "bugs"),
          turnStarted(2, "player"),
        ],
      }),
    );
    expect(logLines()).toEqual([
      "Turn 1 — TDF phase",
      "Turn 1 — bug phase",
      "Turn 2 — TDF phase",
    ]);
  });

  it("does not replay the log again on every later update of the same mission", () => {
    const hud = bareHud();
    const mission = hudMission({ turn: 1, log: [turnStarted(1, "player")] });
    hud.update(mission);
    // A selection, not a command: the log must not grow a second copy.
    hud.update(mission);
    expect(logLines()).toEqual(["Turn 1 — TDF phase"]);
  });

  it("starts the log over when a different mission opens", () => {
    const hud = bareHud();
    hud.update(hudMission({ turn: 1, log: [turnStarted(1, "player")] }));
    hud.update(
      hudMission({
        missionId: "mission-2",
        turn: 1,
        log: [turnStarted(1, "player"), turnStarted(1, "bugs")],
      }),
    );
    expect(logLines()).toEqual(["Turn 1 — TDF phase", "Turn 1 — bug phase"]);
  });
});

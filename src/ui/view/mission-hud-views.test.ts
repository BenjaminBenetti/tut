// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "../../core/model/result";
import type { TacticalNames } from "../service/tactical-error-text";
import type { DefenceProgress } from "../../tactical/service/defence-service";
import type { RescueProgress } from "../../tactical/service/objectives/rescue-civilians-objective";
import type { Unit } from "../../tactical/model/unit";
import { CoverLevel } from "../../mapgen/model/cover";
import { ActionBarView } from "./action-bar-view";
import { TACTICAL_SHORTCUTS } from "../model/tactical-intent";
import { HitPreviewView } from "./hit-preview-view";
import { hudMission, hudTemplate, hudUnit } from "./mission-hud.test-helper";
import { actorOf, describeEvent } from "./event-vocabulary";
import { ObjectiveTrackerView } from "./objective-tracker-view";
import { TurnBannerView } from "./turn-banner-view";
import { UnitCardView } from "./unit-card-view";
import { playerUnits } from "./squad-strip-view";
import { chargeRegisterFor } from "../service/charge-register";
import { RANK_TUNING } from "../../roster/data/rank-tuning";

let root: HTMLElement;
const field = (name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-field="${name}"]`);

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
});

describe("UnitCardView", () => {
  it("shows the placeholder without a unit and the unit's numbers with one", () => {
    const view = new UnitCardView();
    view.mount(root);
    view.update(undefined, undefined);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-unit"]')?.hidden,
    ).toBe(false);
    view.update(
      hudUnit("s1", "tdf", "rifle", 1, 1, {
        hp: 14,
        ap: 1,
        status: ["overwatch"],
      }),
      hudTemplate("rifle", "Rifle Squad"),
    );
    expect(field("unit-name")?.textContent).toBe("Rifle Squad");
    expect(field("unit-side")?.textContent).toBe("tdf · squad");
    // No rank on the template, no badge (#1130).
    expect(field("unit-rank")?.hidden).toBe(true);
    expect(field("hp")?.textContent).toBe("14 / 20");
    expect(field("ap")?.textContent).toBe("1 / 2");
    expect(field("weapon")?.textContent).toBe(
      "range 8 · acc 65 · dmg 10 · pen 0",
    );
    expect(field("status")?.textContent).toBe("overwatch");
    expect(
      root
        .querySelector<HTMLElement>(".tut-meter__fill")
        ?.style.getPropertyValue("--value"),
    ).toBe("70%");
  });
});

describe("UnitCardView rank badge (#1130)", () => {
  it("opens the rank popover from the badge when it is given the tuning (#1134)", () => {
    const view = new UnitCardView({}, { rankTuning: RANK_TUNING });
    view.mount(root);
    view.update(hudUnit("s1", "tdf", "rifle", 1, 1), {
      ...hudTemplate("rifle", "Rifle Squad"),
      rank: { name: "Corporal", index: 2 },
    });
    const badge = field("unit-rank");
    expect(badge?.classList.contains("tut-rank")).toBe(true);
    badge?.dispatchEvent(new Event("mouseenter"));
    const tip = document.querySelector<HTMLElement>(
      '[data-role="rank-tooltip"]',
    );
    expect(tip?.hidden).toBe(false);
    expect(tip?.textContent).toContain("+1 move · +4 accuracy · +0 AP");
    badge?.dispatchEvent(new Event("mouseleave"));
    expect(tip?.hidden).toBe(true);
    // A card built without the tuning has nothing to say and no anchor.
    const bare = new UnitCardView();
    const other = document.createElement("div");
    document.body.appendChild(other);
    bare.mount(other);
    bare.update(hudUnit("s2", "tdf", "rifle", 1, 1), {
      ...hudTemplate("rifle", "Rifle Squad"),
      rank: { name: "Corporal", index: 2 },
    });
    expect(
      other
        .querySelector<HTMLElement>('[data-field="unit-rank"]')
        ?.classList.contains("tut-rank"),
    ).toBe(false);
  });

  it("names the rank the template was built at, and hides it for a template without one", () => {
    const view = new UnitCardView();
    view.mount(root);
    const unit = hudUnit("s1", "tdf", "rifle", 1, 1, {});
    view.update(unit, {
      ...hudTemplate("rifle", "Rifle Squad"),
      rank: { name: "Corporal", index: 2 },
    });
    expect(field("unit-rank")?.hidden).toBe(false);
    expect(field("unit-rank")?.textContent).toBe("Corporal");
    view.update(unit, hudTemplate("rifle", "Rifle Squad"));
    expect(field("unit-rank")?.hidden).toBe(true);
  });
});

describe("UnitCardView weapon lines (#641)", () => {
  /** A mech template carrying an arm gun and a back gun. */
  function twoWeaponTemplate() {
    const base = hudTemplate("mech", "Hammerhead");
    const first = base.weapons[0]!;
    return {
      ...base,
      weapons: [
        {
          ...first,
          id: "arm-weapon",
          name: "Autocannon",
          charges: 4,
          profile: { ...first.profile, range: 10 },
        },
        {
          ...first,
          id: "back-weapon",
          name: "Missile Pod",
          charges: 4,
          profile: { ...first.profile, range: 14 },
        },
      ],
    };
  }

  /** The blocks rendered into one card field. */
  const blocks = (name: string): HTMLElement[] => [
    ...(field(name)?.querySelectorAll<HTMLElement>(".tut-card__entry") ?? []),
  ];

  it("gives each weapon its own block, titled, so two do not run together", () => {
    const view = new UnitCardView();
    view.mount(root);
    view.update(
      hudUnit("m1", "tdf", "mech", 1, 1, { kind: "mech" }),
      twoWeaponTemplate(),
    );
    // Two weapons, two blocks — a run-on string would be one, which is
    // precisely what shipped and what nothing here was checking.
    const weapons = blocks("weapon");
    expect(weapons).toHaveLength(2);
    expect(
      weapons.map(
        (b) =>
          b.querySelector<HTMLElement>(".tut-card__entry-name")?.textContent,
      ),
    ).toEqual(["Autocannon", "Missile Pod"]);
    expect(weapons[0]?.textContent).toContain("range 10");
    expect(weapons[1]?.textContent).toContain("range 14");
    // Each weapon carries its own pool, inside its own block (#652):
    // the separate Charges list repeated both names to say which pool
    // was which, and that repetition is what pushed the card off screen.
    expect(weapons[0]?.textContent).toContain("heat 4 / 4");
    expect(weapons[1]?.textContent).toContain("heat 4 / 4");
    expect(field("charges")).toBeNull();
  });

  it("announces the weapon row the pointer or focus rests on, once, and the leave (#1132)", () => {
    const hovered: (string | undefined)[] = [];
    const view = new UnitCardView({
      onRowHover: (row) =>
        hovered.push(row?.kind === "weapon" ? row.weaponId : undefined),
    });
    view.mount(root);
    view.update(
      hudUnit("m1", "tdf", "mech", 1, 1, { kind: "mech" }),
      twoWeaponTemplate(),
    );
    const rows = blocks("weapon");
    expect(rows.map((b) => b.dataset.role)).toEqual([
      "weapon-row",
      "weapon-row",
    ]);
    expect(rows.map((b) => b.dataset.weaponId)).toEqual([
      "arm-weapon",
      "back-weapon",
    ]);
    // Reachable by keyboard, not only by pointer.
    expect(rows.map((b) => b.tabIndex)).toEqual([0, 0]);
    rows[1]?.dispatchEvent(new Event("mouseenter"));
    expect(hovered).toEqual(["back-weapon"]);
    expect(view.hoveredRow()).toEqual({
      kind: "weapon",
      weaponId: "back-weapon",
    });
    // Resting on the same row again says nothing new.
    rows[1]?.dispatchEvent(new Event("mouseenter"));
    expect(hovered).toEqual(["back-weapon"]);
    rows[1]?.dispatchEvent(new Event("mouseleave"));
    expect(hovered).toEqual(["back-weapon", undefined]);
    rows[0]?.dispatchEvent(new Event("focus"));
    expect(hovered.at(-1)).toBe("arm-weapon");
    // Hiding the card is a leave: the row cannot report one itself.
    view.update(undefined, undefined);
    expect(hovered.at(-1)).toBeUndefined();
    expect(view.hoveredRow()).toBeUndefined();
  });

  it("announces an item's row the same way, and marks every restable row as hoverable (#1134)", () => {
    const hovered: (string | undefined)[] = [];
    const view = new UnitCardView({
      onRowHover: (row) =>
        hovered.push(
          row === undefined
            ? undefined
            : row.kind === "equipment"
              ? `item:${row.equipmentId}`
              : `weapon:${row.weaponId}`,
        ),
    });
    view.mount(root);
    view.update(
      { ...hudUnit("s1", "tdf", "rifle", 1, 1), equipment: { grenade: 1 } },
      {
        ...hudTemplate("rifle", "Rifle Squad"),
        equipment: ["grenade", "radar-dish"],
      },
    );
    const items = blocks("equipment");
    expect(items.map((b) => b.dataset.role)).toEqual([
      "equipment-row",
      "equipment-row",
    ]);
    expect(items.map((b) => b.dataset.equipmentId)).toEqual([
      "grenade",
      "radar-dish",
    ]);
    expect(items.map((b) => b.tabIndex)).toEqual([0, 0]);
    // Every restable row says so: the cursor and the lift come from
    // this class, and a row without it is a hover nobody finds.
    for (const row of [...blocks("weapon"), ...items]) {
      expect(row.classList.contains("tut-card__entry--hoverable")).toBe(true);
    }
    items[1]?.dispatchEvent(new Event("mouseenter"));
    expect(hovered).toEqual(["item:radar-dish"]);
    expect(view.hoveredRow()).toEqual({
      kind: "equipment",
      equipmentId: "radar-dish",
    });
    // Moving from an item to a weapon is one change, not a leave and an enter.
    blocks("weapon")[0]?.dispatchEvent(new Event("focus"));
    expect(hovered.at(-1)).toBe("weapon:primary");
    items[1]?.dispatchEvent(new Event("mouseleave"));
    expect(hovered.at(-1)).toBe("weapon:primary");
    blocks("weapon")[0]?.dispatchEvent(new Event("blur"));
    expect(hovered.at(-1)).toBeUndefined();
  });

  it("leaves a one-weapon card exactly as it was, with no name line", () => {
    const view = new UnitCardView();
    view.mount(root);
    view.update(
      hudUnit("s1", "tdf", "rifle", 1, 1),
      hudTemplate("rifle", "Rifle Squad"),
    );
    expect(blocks("weapon")).toHaveLength(1);
    expect(field("weapon")?.querySelector(".tut-card__entry-name")).toBeNull();
    expect(field("weapon")?.textContent).toBe(
      "range 8 · acc 65 · dmg 10 · pen 0",
    );
  });

  it("comes back after a unit with no charges, rather than staying blank", () => {
    const view = new UnitCardView();
    view.mount(root);
    const mech = hudUnit("m1", "tdf", "mech", 1, 1, { kind: "mech" });
    const template = twoWeaponTemplate();
    view.update(mech, template);
    const pools = () =>
      field("weapon")?.querySelectorAll('[data-role="charges"]').length;
    expect(pools()).toBe(2);
    // A squad carries no pool at all, so its weapon block has no line.
    view.update(
      hudUnit("s1", "tdf", "rifle", 1, 1),
      hudTemplate("rifle", "Rifle Squad"),
    );
    expect(pools()).toBe(0);
    // Selecting the mech again has to redraw it: the memo that skips an
    // unchanged rebuild keys on the charges too, or the pools stay gone.
    view.update(mech, template);
    expect(pools()).toBe(2);
  });
});

describe("ActionBarView", () => {
  /**
   * The bar lists the actions with the keys that reach them; a press is
   * the key (the Executive Director's ask on #1113: keep the hotkeys
   * listed). Unavailable actions are marked rather than disabled
   * (#1030), so a press still reaches the HUD to be explained.
   */
  it("writes each action's key from the shortcut table, and reports a press as the key would", () => {
    const onAction = vi.fn<(action: string) => void>();
    const view = new ActionBarView({ onAction }, TACTICAL_SHORTCUTS);
    view.mount(root);
    const hint = (a: string): string | null | undefined =>
      root.querySelector<HTMLElement>(
        `#action-bar [data-action="${a}"] [data-role="shortcut"]`,
      )?.textContent;
    // The number row, in the bar's order: keys under the left hand.
    expect(hint("move")).toBe("1");
    expect(hint("attack")).toBe("2");
    expect(hint("overwatch")).toBe("3");
    expect(hint("reload")).toBe("4");
    expect(hint("interact")).toBe("5");
    expect(hint("extract")).toBe("6");
    expect(hint("end-turn")).toBe("7");
    root.querySelector<HTMLButtonElement>('[data-action="overwatch"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="end-turn"]')?.click();
    expect(onAction.mock.calls.map((c) => c[0])).toEqual([
      "overwatch",
      "end-turn",
    ]);
  });

  it("marks what is unavailable, names the refill and the unspent, and shows the aim", () => {
    const view = new ActionBarView({ onAction: vi.fn() }, TACTICAL_SHORTCUTS);
    view.mount(root);
    const button = (a: string) =>
      root.querySelector<HTMLButtonElement>(`[data-action="${a}"]`);
    expect(button("attack")?.getAttribute("aria-disabled")).toBe("true");
    view.update({
      playerPhase: true,
      unavailable: ["reload"],
      hasActor: true,
      reloadLabel: "Vent",
      aiming: true,
      unspent: 2,
    });
    expect(button("attack")?.getAttribute("aria-disabled")).toBe("false");
    expect(button("attack")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("reload")?.classList.contains("is-unavailable")).toBe(true);
    expect(button("reload")?.textContent).toContain("Vent");
    expect(button("end-turn")?.textContent).toContain("End turn (2 unspent)");
    // Board, not Extract: it is boarding the drop ship (#1112).
    expect(button("extract")?.textContent).toContain("Board");
    // Nothing of the player's selected: no unit action, End turn still on.
    view.update({
      playerPhase: true,
      unavailable: [],
      hasActor: false,
      reloadLabel: "Reload",
      aiming: false,
      unspent: 0,
    });
    expect(button("move")?.getAttribute("aria-disabled")).toBe("true");
    expect(button("end-turn")?.getAttribute("aria-disabled")).toBe("false");
    expect(button("end-turn")?.textContent).not.toContain("unspent");
    // Off phase: End turn marked, and a press still reported.
    const onAction = vi.fn();
    const off = new ActionBarView({ onAction }, TACTICAL_SHORTCUTS);
    off.mount(root);
    off.update({
      playerPhase: false,
      unavailable: [],
      hasActor: false,
      reloadLabel: "Reload",
      aiming: false,
      unspent: 0,
    });
    const bars = root.querySelectorAll("#action-bar");
    const last = bars[bars.length - 1];
    const end = last?.querySelector<HTMLButtonElement>(
      '[data-action="end-turn"]',
    );
    expect(end?.classList.contains("is-unavailable")).toBe(true);
    end?.click();
    expect(onAction).toHaveBeenCalledWith("end-turn");
  });

  it("marks every button with its icon", () => {
    const view = new ActionBarView({ onAction: vi.fn() }, TACTICAL_SHORTCUTS);
    view.mount(root);
    const iconOf = (a: string) =>
      root
        .querySelector<HTMLElement>(`[data-action="${a}"] .tut-icon`)
        ?.style.getPropertyValue("--icon");
    expect(iconOf("move")).toBe("url(/assets/ui/icons/move.svg)");
    expect(iconOf("end-turn")).toBe("url(/assets/ui/icons/end-turn.svg)");
    expect(iconOf("attack")).toBe("url(/assets/ui/icons/attack.svg)");
  });
});

describe("ObjectiveTrackerView", () => {
  it("lists objectives with their state and remaining spawner hp", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    const mission = hudMission();
    view.update(mission.objectives, mission.spawners);
    expect(field("objective-summary")?.textContent).toBe("1 / 2");
    const rows = [...root.querySelectorAll<HTMLElement>("[data-objective-id]")];
    expect(rows.map((r) => r.dataset.complete)).toEqual(["false", "true"]);
    expect(rows[0]?.textContent).toContain("20 hp");
    expect(rows[1]?.textContent).not.toContain("hp");
  });

  /**
   * The label is what the player reads for the whole mission, so it is
   * asserted as rendered text rather than through `data-target-id`
   * (#949). The id stays on the dataset for the scene and for tests.
   */
  it("labels objectives by ordinal and never puts the spawner id in the text", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    const mission = hudMission();
    view.update(mission.objectives, mission.spawners);
    const rows = [...root.querySelectorAll<HTMLElement>("[data-objective-id]")];
    const labels = rows.map(
      (row) =>
        [...row.querySelectorAll("span")]
          .map((span) => span.textContent ?? "")
          .find((text) => text.startsWith("Destro")) ?? "",
    );
    expect(labels).toEqual(["Destroy spawner 1", "Destroyed spawner 2"]);
    expect(rows.map((row) => row.dataset.targetId)).toEqual([
      "spawner-1",
      "spawner-2",
    ]);
    for (const row of rows) {
      expect(row.textContent).not.toMatch(/spawner-\d/);
    }
  });
});

/**
 * The status template used to interpolate the id as English, so a noun
 * came out as "Rifle Squad is overwatch" (#1029). Pinned as rendered
 * text, because the defect was grammar rather than data.
 */
describe("event vocabulary", () => {
  it("gives each status a phrase rather than pasting its id into a sentence", () => {
    const line = describeEvent(
      {
        type: "tactical:unit-status-changed",
        payload: { unitId: "unit-2", status: ["overwatch"] },
      } as never,
      { ...NAMES, unit: () => "Rifle Squad" },
    );
    expect(line?.text).toBe("Rifle Squad is on overwatch");
  });

  it("names the scan and the battery on deployment, and says a dead scanner is dead (#1130)", () => {
    const radar = {
      id: "radar-1",
      team: "tdf" as const,
      pos: { x: 1, y: 0, z: 1 },
      range: 30,
      turnsLeft: 3,
    };
    const deployed = describeEvent(
      {
        type: "tactical:radar-deployed",
        payload: { unitId: "unit-2", radar },
      } as never,
      { ...NAMES, unit: () => "Radio Squad" },
    );
    expect(deployed?.text).toBe(
      "Radio Squad deployed radar · 30-tile scan · 3-turn battery",
    );
    const dead = describeEvent(
      {
        type: "tactical:radar-burned-out",
        payload: { radarId: "radar-1", pos: radar.pos },
      } as never,
      NAMES,
    );
    expect(dead).toEqual({
      text: "Radar burnt out · battery dead",
      icon: "radar",
      tone: "dim",
    });
  });

  it("says who a kit mended and by how much, repaired for metal (#1138)", () => {
    const names = {
      ...NAMES,
      unit: (id: string) =>
        ({ medic: "Medic Squad", hurt: "Rifle Squad", mech: "Hammerhead" })[
          id
        ] ?? id,
    };
    const healed = describeEvent(
      {
        type: "tactical:units-healed",
        payload: {
          kitId: "medkit",
          userId: "medic",
          healed: [
            { unitId: "hurt", amount: 10, hpAfter: 20 },
            { unitId: "medic", amount: 3, hpAfter: 20 },
          ],
        },
      } as never,
      names,
    );
    expect(healed).toEqual({
      text: "Medic Squad healed Rifle Squad for 10, Medic Squad for 3",
      icon: "hp",
      tone: "ok",
    });
    const repaired = describeEvent(
      {
        type: "tactical:units-healed",
        payload: {
          kitId: "repair-kit",
          userId: "medic",
          healed: [{ unitId: "mech", amount: 25, hpAfter: 60 }],
        },
      } as never,
      names,
    );
    expect(repaired?.text).toBe("Medic Squad repaired Hammerhead for 25");
  });

  it("still reads correctly for a status that happens to be an adjective", () => {
    const line = describeEvent(
      {
        type: "tactical:unit-status-changed",
        payload: { unitId: "unit-2", status: ["suppressed"] },
      } as never,
      { ...NAMES, unit: () => "Rifle Squad" },
    );
    expect(line?.text).toBe("Rifle Squad is suppressed");
  });
});

describe("TurnBannerView", () => {
  it("shows turn and phase, a status line, and reports Leave", () => {
    const onLeave = vi.fn();
    const onLayerStep = vi.fn();
    const view = new TurnBannerView({ onLeave, onLayerStep });
    view.mount(root);
    view.update({
      missionName: "Seoul",
      turn: 3,
      phase: "bugs",
      tdfUnits: 2,
      bugUnits: 5,
      layer: { floor: 2, floors: 3 },
    });
    // The banner names the city, never the id (#753).
    expect(field("mission-name")?.textContent).toBe("Seoul");
    expect(field("tdf-units")?.textContent).toBe("2");
    expect(field("bug-units")?.textContent).toBe("5");
    expect(field("turn")?.textContent).toBe("3");
    expect(field("phase")?.dataset.phase).toBe("bugs");
    view.showStatus("Nope");
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    expect(status?.hidden).toBe(false);
    view.showStatus("");
    expect(status?.hidden).toBe(true);
    root
      .querySelector<HTMLButtonElement>('[data-action="leave-mission"]')
      ?.click();
    expect(onLeave).toHaveBeenCalled();
  });

  // #961: the player is changing this constantly, so it is a banner stat
  // with buttons beside it rather than something in a menu. Since #1136
  // the roofed top view reads "All" rather than a floor number: it is
  // the roof going back on, not a floor to go looking for.
  it("reads out the floor one-based, the roofed top as All, and reports each button", () => {
    const onLeave = vi.fn();
    const onLayerStep = vi.fn();
    const view = new TurnBannerView({ onLeave, onLayerStep });
    view.mount(root);
    const model = {
      missionName: "Seoul",
      turn: 1,
      phase: "player",
      tdfUnits: 2,
      bugUnits: 0,
    } as const;
    view.update({ ...model, layer: { floor: 2, floors: 3 } });
    expect(field("floor")?.textContent).toBe("2 / 3");

    const down = root.querySelector<HTMLButtonElement>(
      '[data-action="layer-down"]',
    );
    const up = root.querySelector<HTMLButtonElement>(
      '[data-action="layer-up"]',
    );
    down?.click();
    up?.click();
    expect(onLayerStep.mock.calls).toEqual([[-1], [1]]);

    // Disabled where there is nowhere to go, rather than removed: an
    // inert control is easier to learn than one that comes and goes.
    view.update({ ...model, layer: { floor: 1, floors: 3 } });
    expect(down?.disabled).toBe(true);
    expect(up?.disabled).toBe(false);
    // The top floor still has the roof-off view above it.
    view.update({ ...model, layer: { floor: 3, floors: 3 } });
    expect(down?.disabled).toBe(false);
    expect(up?.disabled).toBe(false);
    // The roofed top: nowhere up, and down takes the roof off.
    view.update({ ...model, layer: { floor: undefined, floors: 3 } });
    expect(field("floor")?.textContent).toBe("All");
    expect(down?.disabled).toBe(false);
    expect(up?.disabled).toBe(true);

    // Open ground: both ends at once, and the control says so.
    view.update({ ...model, layer: { floor: undefined, floors: 0 } });
    expect(field("floor")?.textContent).toBe("All");
    expect(down?.disabled).toBe(true);
    expect(up?.disabled).toBe(true);

    // No mission at all.
    view.update(undefined);
    expect(field("floor")?.textContent).toBe("—");
    expect(down?.disabled).toBe(true);
  });

  it("shows the soonest deadline beside the phase, pulsing when urgent, and hides it otherwise", () => {
    const view = new TurnBannerView({ onLeave: vi.fn(), onLayerStep: vi.fn() });
    view.mount(root);
    const model = {
      missionName: "Seoul",
      turn: 6,
      phase: "player",
      tdfUnits: 2,
      bugUnits: 0,
      layer: undefined,
    } as const;
    view.update(model);
    const badge = field("deadline");
    expect(badge?.hidden).toBe(true);
    view.update({
      ...model,
      deadline: { text: "Pod matures in 3 turns", turnsLeft: 3, urgent: false },
    });
    expect(badge?.hidden).toBe(false);
    expect(badge?.textContent).toBe("Pod matures in 3 turns");
    expect(badge?.dataset.urgent).toBe("false");
    expect(badge?.classList.contains("tut-badge--warn")).toBe(true);
    view.update({
      ...model,
      deadline: { text: "Pod matures in 2 turns", turnsLeft: 2, urgent: true },
    });
    expect(badge?.dataset.urgent).toBe("true");
    expect(badge?.classList.contains("tut-badge--danger")).toBe(true);
    expect(badge?.classList.contains("tut-badge--warn")).toBe(false);
    view.update(model);
    expect(badge?.hidden).toBe(true);
    view.update(undefined);
    expect(badge?.hidden).toBe(true);
  });
});

/** A resolver whose answers are obviously names, so a leaked id shows. */
const NAMES: TacticalNames = {
  unit: () => "Swarmer",
  objective: () => "spawner 1",
  spawner: () => "spawner 1",
  target: () => "Swarmer",
  charge: () => chargeRegisterFor("squad"),
  mech: () => "Hammerhead",
  mission: () => "Lagos",
};

describe("HitPreviewView", () => {
  it("is hidden without a model, shows the numbers and chips, and reports Fire", () => {
    const onConfirm = vi.fn();
    const view = new HitPreviewView({ onConfirm });
    view.mount(root);
    expect(root.querySelector<HTMLElement>("#hit-preview")?.hidden).toBe(true);
    view.update({
      names: NAMES,
      targetName: "Swarmer",
      preview: ok({
        hitChance: 51,
        damage: [8, 13],
        distance: 7,
        cover: CoverLevel.LOW,
        flanked: false,
        elevation: 1,
      }),
    });
    expect(root.querySelector<HTMLElement>("#hit-preview")?.hidden).toBe(false);
    expect(field("target-name")?.textContent).toBe("Swarmer");
    expect(field("hit-chance")?.textContent).toBe("51% hit");
    expect(field("damage-range")?.textContent).toBe("8–13 damage");
    expect(field("preview-terrain")?.textContent).toBe(
      "7 tiles · low cover · +1 lvl",
    );
    const fire = root.querySelector<HTMLButtonElement>(
      '[data-action="confirm-attack"]',
    );
    expect(fire?.disabled).toBe(false);
    fire?.click();
    expect(onConfirm).toHaveBeenCalled();
  });

  // #1035: the refusal the ticket is named after. The view used to
  // render `No line of sight to "bug-3"` straight from the typed error.
  it("names the target in a refusal instead of showing its id", () => {
    const view = new HitPreviewView({ onConfirm: vi.fn() });
    view.mount(root);
    view.update({
      names: NAMES,
      targetName: "Swarmer",
      preview: err({ kind: "no-line-of-sight", targetId: "bug-3" }),
    });
    const error = root.querySelector<HTMLElement>(
      '[data-role="preview-error"]',
    );
    expect(error?.textContent).toBe("No line of sight to Swarmer");
    expect(error?.textContent).not.toContain("bug-3");
  });

  it("shows the refusal and disables Fire", () => {
    const view = new HitPreviewView({ onConfirm: vi.fn() });
    view.mount(root);
    view.update({
      names: NAMES,
      targetName: "Swarmer",
      preview: err({ kind: "out-of-range", distance: 12, range: 8 }),
    });
    expect(
      root.querySelector<HTMLElement>('[data-role="preview-error"]')
        ?.textContent,
    ).toContain("12 tiles");
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="confirm-attack"]')
        ?.disabled,
    ).toBe(true);
  });
});

describe("UnitCardView for a deployed turret (#1138)", () => {
  it("reads the battery in place of the action budget, and gives a squad its rows back", () => {
    const view = new UnitCardView();
    view.mount(root);
    view.update(
      hudUnit("t1", "tdf", "turret", 2, 2, {
        kind: "turret",
        hp: 30,
        maxHp: 30,
        ap: 0,
        maxAp: 0,
        status: ["overwatch"],
        turnsLeft: 3,
      }),
      { ...hudTemplate("turret", "Turret"), maxAp: 0, move: 0 },
      0,
    );
    expect(field("unit-name")?.textContent).toBe("Turret");
    expect(field("unit-side")?.textContent).toBe("tdf · turret");
    expect(field("hp")?.textContent).toBe("30 / 30");
    expect(field("battery")?.textContent).toBe("3 turns");
    expect(field("battery")?.hidden).toBe(false);
    for (const hidden of ["ap", "move", "attacks"]) {
      expect(field(hidden)?.hidden, hidden).toBe(true);
    }
    expect(field("status")?.textContent).toBe("overwatch");
    view.update(
      hudUnit("t1", "tdf", "turret", 2, 2, { kind: "turret", turnsLeft: 1 }),
      hudTemplate("turret", "Turret"),
    );
    expect(field("battery")?.textContent).toBe("1 turn");
    view.update(
      hudUnit("s1", "tdf", "rifle", 1, 1),
      hudTemplate("rifle", "Rifle Squad"),
    );
    expect(field("ap")?.hidden).toBe(false);
    expect(field("battery")?.hidden).toBe(true);
  });
});

describe("event vocabulary for turrets (#1138)", () => {
  it("names the shots and the battery on deployment, says a burnt-out turret is dead, and does not stutter the use", () => {
    const deployed = describeEvent(
      {
        type: "tactical:turret-deployed",
        payload: {
          unitId: "unit-2",
          turretId: "unit-9",
          tile: { x: 1, y: 0, z: 1 },
          turnsLeft: 3,
          overwatchShots: 2,
        },
      } as never,
      { ...NAMES, unit: () => "Engineer Squad" },
    );
    expect(deployed).toEqual({
      text: "Engineer Squad deployed a turret · 2 shots a turn on overwatch · 3-turn battery",
      icon: "overwatch",
      tone: "accent",
    });
    const dead = describeEvent(
      {
        type: "tactical:turret-burned-out",
        payload: { turretId: "unit-9", pos: { x: 1, y: 0, z: 1 } },
      } as never,
      NAMES,
    );
    expect(dead).toEqual({
      text: "Turret burned out · battery dead",
      icon: "overwatch",
      tone: "dim",
    });
    expect(
      describeEvent(
        {
          type: "tactical:equipment-used",
          payload: {
            unitId: "unit-2",
            equipmentId: "turret",
            name: "Turret",
            tile: { x: 1, y: 0, z: 1 },
            usesLeft: 1,
          },
        } as never,
        NAMES,
      ),
    ).toBeUndefined();
  });
});

describe("playerUnits (#1138)", () => {
  it("lists the force the player orders, never a deployed turret", () => {
    const base = hudMission();
    const mission = {
      ...base,
      units: [
        ...base.units,
        hudUnit("t1", "tdf", "turret", 2, 2, { kind: "turret", turnsLeft: 3 }),
      ],
    };
    expect(playerUnits(mission).map((unit) => unit.id)).toEqual(["s1", "s2"]);
  });
});

// ===========================================
// Defences (#1175)
// ===========================================

describe("ObjectiveTrackerView on a defence (#1175)", () => {
  const DEFENCE = {
    id: "objective-d",
    kind: "defend-generators" as const,
    installation: "sensor-array" as const,
    targetIds: ["gen-1", "gen-2", "gen-3"],
    complete: false,
    failed: false,
  };
  const progress = (
    overrides: Partial<DefenceProgress> = {},
  ): DefenceProgress => ({
    standing: 2,
    total: 3,
    wave: 3,
    totalWaves: 5,
    bugsLeft: 4,
    status: "open",
    ...overrides,
  });
  /** The HUD hands the tracker its readings keyed by objective id. */
  const readings = (
    overrides: Partial<DefenceProgress> = {},
  ): ReadonlyMap<string, DefenceProgress> =>
    new Map([[DEFENCE.id, progress(overrides)]]);
  const row = (): HTMLElement | null =>
    root.querySelector<HTMLElement>('[data-objective-id="objective-d"]');
  const detail = (): string =>
    row()?.querySelector('[data-role="defence-progress"]')?.textContent ?? "";

  it("names the installation, counts generators and waves, and never shows a unit id", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([DEFENCE], [], undefined, readings());
    expect(row()?.textContent).toContain("Defend the sensor array");
    expect(row()?.dataset.status).toBe("open");
    expect(row()?.dataset.failed).toBe("false");
    expect(detail()).toBe("2 / 3 generators · wave 3 / 5");
    expect(row()?.textContent).not.toMatch(/gen-\d/);
    expect(field("objective-summary")?.textContent).toBe("0 / 1");
  });

  it("counts the bugs left only once the last wave is in", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([DEFENCE], [], undefined, readings({ wave: 5, bugsLeft: 1 }));
    expect(detail()).toBe("2 / 3 generators · wave 5 / 5 · 1 bug left");
  });

  it("reads Held once complete and Lost once failed, in the danger tone", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update(
      [{ ...DEFENCE, complete: true }],
      [],
      undefined,
      readings({ wave: 5, bugsLeft: 0, status: "complete" }),
    );
    expect(row()?.textContent).toContain("Held the sensor array");
    expect(field("objective-summary")?.textContent).toContain(
      "board the drop ship",
    );
    view.update(
      [{ ...DEFENCE, failed: true }],
      [],
      undefined,
      readings({ standing: 0, status: "failed" }),
    );
    expect(row()?.textContent).toContain("Lost the sensor array");
    expect(row()?.dataset.failed).toBe("true");
    expect(row()?.dataset.status).toBe("failed");
  });

  it("falls back to the stored flags when no progress is handed over", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([{ ...DEFENCE, failed: true }], []);
    expect(row()?.dataset.status).toBe("failed");
    expect(row()?.querySelector('[data-role="defence-progress"]')).toBeNull();
  });
});

describe("event vocabulary for defences (#1175)", () => {
  const names = { ...NAMES, objective: () => "the sensor array" };

  it("counts an edge wave against the total, and leaves a hatch uncounted", () => {
    const arrived = (wave?: number, totalWaves?: number) =>
      describeEvent(
        {
          type: "tactical:bugs-spawned",
          payload: {
            unitIds: ["b1", "b2", "b3"],
            source: "edge",
            sourceId: "hook-1",
            ...(wave === undefined ? {} : { wave }),
            ...(totalWaves === undefined ? {} : { totalWaves }),
          },
        } as never,
        names,
      );
    expect(arrived(3, 5)?.text).toBe("Wave 3 of 5: 3 bugs arrived at the edge");
    expect(arrived(3)?.text).toBe("Wave 3: 3 bugs arrived at the edge");
    expect(arrived()?.text).toBe("3 bugs arrived at the edge");
  });

  it("says a generator was destroyed, and by what when it is known", () => {
    const unit = (id: string) => (id === "gen-1" ? "Generator" : "Brute");
    const line = (killerId?: string) =>
      describeEvent(
        {
          type: "tactical:generator-destroyed",
          payload: {
            generatorId: "gen-1",
            pos: { x: 1, y: 0, z: 1 },
            ...(killerId === undefined ? {} : { killerId }),
          },
        } as never,
        { ...names, unit },
      );
    expect(line("b1")).toMatchObject({
      text: "Generator destroyed by Brute",
      icon: "warning",
      tone: "danger",
    });
    expect(line()?.text).toBe("Generator destroyed");
  });

  it("reports a failed objective as failed, not updated", () => {
    const line = describeEvent(
      {
        type: "tactical:objective-updated",
        payload: { objectiveId: "objective-d", complete: false, failed: true },
      } as never,
      names,
    );
    expect(line).toMatchObject({
      text: "Objective failed: the sensor array",
      icon: "warning",
      tone: "danger",
    });
    const held = describeEvent(
      {
        type: "tactical:objective-updated",
        payload: { objectiveId: "objective-d", complete: true, failed: false },
      } as never,
      names,
    );
    expect(held?.text).toBe("Objective complete: the sensor array");
  });
});

describe("event vocabulary for the spore pod (campaign arc §6.3)", () => {
  const names = { ...NAMES, objective: () => "the spore pod" };

  it("says the pod was destroyed, and stays quiet about a nest's wreck", () => {
    const wreck = (variant?: "spore-pod") =>
      describeEvent(
        {
          type: "tactical:spawner-damaged",
          payload: {
            spawnerId: "spawner-1",
            unitId: "u1",
            damage: 10,
            hp: 0,
            destroyed: true,
            ...(variant === undefined ? {} : { variant }),
          },
        } as never,
        names,
      );
    expect(wreck("spore-pod")).toMatchObject({
      text: "Spore pod destroyed",
      icon: "check",
      tone: "ok",
    });
    expect(wreck()).toBeUndefined();
    const scratch = describeEvent(
      {
        type: "tactical:spawner-damaged",
        payload: {
          spawnerId: "spawner-1",
          unitId: "u1",
          damage: 10,
          hp: 30,
          destroyed: false,
          variant: "spore-pod",
        },
      } as never,
      names,
    );
    expect(scratch).toBeUndefined();
  });

  it("says the pod matured and what burst out of it", () => {
    expect(
      describeEvent(
        {
          type: "tactical:spore-pod-matured",
          payload: { spawnerId: "spawner-1", objectiveId: "objective-1" },
        } as never,
        names,
      ),
    ).toMatchObject({
      text: "Spore pod matured",
      icon: "warning",
      tone: "danger",
    });
    expect(
      describeEvent(
        {
          type: "tactical:bugs-spawned",
          payload: {
            unitIds: ["b1", "b2", "b3", "b4", "b5"],
            source: "pod",
            sourceId: "spawner-1",
          },
        } as never,
        names,
      ),
    ).toMatchObject({ text: "5 bugs burst from the spore pod", tone: "bug" });
  });
});

describe("capturing a specimen (#1179)", () => {
  const LURKER = {
    unitId: "unit-9",
    species: "lurker" as const,
    templateId: "bug:lurker",
    movePenalty: 1,
  };

  it("shows the specimen on its carrier's card and the move it leaves, and no row for empty hands", () => {
    const view = new UnitCardView();
    view.mount(root);
    view.update(
      hudUnit("s1", "tdf", "rifle", 1, 1, { carrying: LURKER }),
      hudTemplate("rifle", "Rifle Squad"),
    );
    expect(field("carrying")?.hidden).toBe(false);
    expect(field("carrying")?.textContent).toBe("live lurker");
    expect(field("move")?.textContent).toBe("4 (−1 carrying)");
    view.update(
      hudUnit("s1", "tdf", "rifle", 1, 1),
      hudTemplate("rifle", "Rifle Squad"),
    );
    expect(field("carrying")?.hidden).toBe(true);
    expect(field("move")?.textContent).toBe("5");
  });

  it("logs the catch, the drop and the pick-up, each above the squad that did it", () => {
    const names = {
      ...NAMES,
      unit: (id: string) => (id === "s1" ? "Alpha" : "Bravo"),
    };
    expect(
      describeEvent(
        {
          type: "tactical:specimen-captured",
          payload: {
            unitId: "s1",
            specimen: LURKER,
            pos: { x: 2, y: 0, z: 1 },
          },
        } as never,
        names,
      ),
    ).toEqual({
      text: "Alpha netted a live lurker · carrying it",
      icon: "bug",
      tone: "ok",
    });
    expect(
      describeEvent(
        {
          type: "tactical:unit-died",
          payload: { unitId: "s1", dropped: LURKER },
        } as never,
        names,
      )?.text,
    ).toBe("Alpha destroyed · dropped the lurker specimen");
    expect(
      describeEvent(
        {
          type: "tactical:specimen-picked-up",
          payload: {
            unitId: "s2",
            fromUnitId: "s1",
            specimen: LURKER,
            pos: { x: 2, y: 0, z: 1 },
          },
        } as never,
        names,
      )?.text,
    ).toBe("Bravo picked up the lurker specimen");
    // The net's own use is not a second line for the same throw.
    expect(
      describeEvent(
        {
          type: "tactical:equipment-used",
          payload: {
            unitId: "s1",
            equipmentId: "capture-net",
            name: "Capture net",
            tile: { x: 2, y: 0, z: 1 },
            usesLeft: 0,
          },
        } as never,
        names,
      ),
    ).toBeUndefined();
  });
});

// ===========================================
// Civilians (campaign arc §6.4)
// ===========================================

describe("civilian groups in the HUD (campaign arc §6.4)", () => {
  const RESCUE = {
    id: "objective-r",
    kind: "rescue-civilians" as const,
    groupIds: ["c1", "c2", "c3", "c4"],
    complete: false,
    failed: false,
  };
  const progress = (
    overrides: Partial<RescueProgress> = {},
  ): ReadonlyMap<string, RescueProgress> =>
    new Map([
      [
        RESCUE.id,
        {
          rescued: 1,
          trapped: 2,
          freed: 0,
          lost: 1,
          total: 4,
          needed: 2,
          status: "open" as const,
          ...overrides,
        },
      ],
    ]);
  const row = (): HTMLElement | null =>
    root.querySelector<HTMLElement>('[data-objective-id="objective-r"]');
  const detail = (): string =>
    row()?.querySelector('[data-role="rescue-progress"]')?.textContent ?? "";
  const civilian = (overrides: Partial<Unit> = {}): Unit =>
    hudUnit("c1", "tdf", "civilian:civilians", 2, 2, {
      kind: "civilian",
      hp: 10,
      maxHp: 10,
      ap: 0,
      trapped: true,
      ...overrides,
    });
  const civilianTemplate = {
    ...hudTemplate("civilian:civilians", "Civilians"),
    weapons: [],
    maxHp: 10,
    move: 4,
  };

  it("counts the groups aboard against the total and the half, with the trapped and the lost", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([RESCUE], [], undefined, progress());
    expect(row()?.textContent).toContain("Rescue the civilians");
    expect(row()?.dataset.status).toBe("open");
    expect(detail()).toBe("1 / 4 aboard · need 2 · 2 trapped · 1 lost");
    expect(row()?.textContent).not.toMatch(/\bc\d\b/);
  });

  it("drops the target once the half is out, and reads Lost once it cannot be", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update(
      [{ ...RESCUE, complete: true }],
      [],
      undefined,
      progress({ rescued: 2, trapped: 0, lost: 0, status: "complete" }),
    );
    expect(row()?.textContent).toContain("Civilians rescued");
    expect(detail()).toBe("2 / 4 aboard");
    view.update(
      [{ ...RESCUE, failed: true }],
      [],
      undefined,
      progress({ rescued: 0, trapped: 0, lost: 4, status: "failed" }),
    );
    expect(row()?.textContent).toContain("Civilians lost");
    expect(row()?.dataset.failed).toBe("true");
    expect(detail()).toBe("0 / 4 aboard · 4 lost");
  });

  it("gives a group a card with no weapon, and says it is trapped until freed", () => {
    const view = new UnitCardView();
    view.mount(root);
    view.update(civilian(), civilianTemplate);
    expect(field("unit-name")?.textContent).toBe("Civilians");
    expect(field("unit-side")?.textContent).toBe("tdf · civilian");
    expect(field("status")?.textContent).toBe("trapped");
    for (const hidden of ["attacks", "weapon", "equipment"]) {
      expect(field(hidden)?.hidden, hidden).toBe(true);
    }
    expect(field("ap")?.hidden).toBe(false);
    expect(field("move")?.textContent).toBe("4");
    view.update(civilian({ trapped: undefined, ap: 2 }), civilianTemplate);
    expect(field("status")?.textContent).not.toContain("trapped");
    // A squad after the group gets its weapon row back.
    view.update(
      hudUnit("s1", "tdf", "rifle", 1, 1),
      hudTemplate("rifle", "Rifle Squad"),
    );
    expect(field("weapon")?.hidden).toBe(false);
    expect(field("attacks")?.hidden).toBe(false);
  });

  it("leaves a trapped group off the squad strip, and puts it on once freed", () => {
    const base = hudMission();
    const withGroup = (unit: Unit) => ({
      ...base,
      units: [...base.units, unit],
    });
    expect(playerUnits(withGroup(civilian())).map((unit) => unit.id)).toEqual([
      "s1",
      "s2",
    ]);
    expect(
      playerUnits(withGroup(civilian({ trapped: undefined, ap: 2 }))).map(
        (unit) => unit.id,
      ),
    ).toEqual(["s1", "s2", "c1"]);
  });

  it("says who freed a group, counts it aboard, and names its killer", () => {
    const names = {
      ...NAMES,
      unit: (id: string) =>
        id === "c1" ? "Civilians" : id === "s1" ? "Alpha" : "Swarmer",
    };
    const freed = describeEvent(
      {
        type: "tactical:civilians-freed",
        payload: { unitId: "c1", rescuerId: "s1", objectiveId: RESCUE.id },
      },
      names,
    );
    expect(freed).toEqual({
      text: "Civilians freed by Alpha",
      icon: "interact",
      tone: "ok",
    });
    const aboard = describeEvent(
      {
        type: "tactical:civilians-extracted",
        payload: {
          unitId: "c1",
          objectiveId: RESCUE.id,
          rescued: 2,
          total: 4,
        },
      },
      names,
    );
    expect(aboard?.text).toBe("Civilians aboard: 2 of 4 rescued");
    const killed = (killerId?: string) =>
      describeEvent(
        {
          type: "tactical:civilians-killed",
          payload: {
            unitId: "c1",
            pos: { x: 2, y: 0, z: 2 },
            ...(killerId === undefined ? {} : { killerId }),
          },
        },
        names,
      );
    expect(killed("b1")).toEqual({
      text: "Civilians killed by Swarmer",
      icon: "warning",
      tone: "danger",
    });
    expect(killed()?.text).toBe("Civilians killed");
  });

  it("marks a freeing and a death above the group, and a boarding above nobody", () => {
    expect(
      actorOf({
        type: "tactical:civilians-freed",
        payload: { unitId: "c1", rescuerId: "s1", objectiveId: RESCUE.id },
      }),
    ).toBe("c1");
    expect(
      actorOf({
        type: "tactical:civilians-killed",
        payload: { unitId: "c1", pos: { x: 2, y: 0, z: 2 } },
      }),
    ).toBe("c1");
    expect(
      actorOf({
        type: "tactical:civilians-extracted",
        payload: { unitId: "c1", objectiveId: RESCUE.id, rescued: 1, total: 4 },
      }),
    ).toBeUndefined();
  });
});

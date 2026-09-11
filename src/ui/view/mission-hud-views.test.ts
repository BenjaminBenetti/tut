// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "../../core/model/result";
import type { TacticalNames } from "../service/tactical-error-text";
import { CoverLevel } from "../../mapgen/model/cover";
import type { ActionBarAction } from "./action-bar-view";
import { ActionBarView } from "./action-bar-view";
import { HitPreviewView } from "./hit-preview-view";
import { hudMission, hudTemplate, hudUnit } from "./mission-hud.test-helper";
import { describeEvent } from "./event-vocabulary";
import { ObjectiveTrackerView } from "./objective-tracker-view";
import { TurnBannerView } from "./turn-banner-view";
import { UnitCardView } from "./unit-card-view";
import { chargeRegisterFor } from "../service/charge-register";

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
  it("puts Attack's digit on every weapon button, not just the first (#652)", () => {
    const view = new ActionBarView({ onAction: vi.fn() });
    view.mount(root);
    view.update({
      canAct: true,
      playerPhase: true,
      mode: undefined,
      weapons: [
        { id: "arm-weapon", name: "Autocannon", ready: true },
        { id: "back-weapon", name: "Missile Pod", ready: true },
      ],
    });
    const weapons = [...root.querySelectorAll<HTMLElement>("[data-weapon-id]")];
    expect(weapons).toHaveLength(2);
    // One key reaches both -- press it again to cycle (#532) -- so the
    // digit is true on each. A button without the hint also loses the
    // indent it reserves, so its glyph and label sit left of its
    // neighbours' and the bar reads as though it had no shortcut.
    const hints = weapons.map(
      (b) =>
        b.querySelector<HTMLElement>('[data-role="shortcut"]')?.textContent,
    );
    expect(hints).toEqual(["2", "2"]);
    // And the one that is not first says how to reach it.
    expect(weapons[1]?.title).toContain("press again");
  });

  /**
   * The bar marks what is unavailable and still reports the press
   * (#1030). It used to `disable` the button, which is why clicking an
   * unavailable action taught the player nothing: the click never
   * happened, so nothing could explain it. Availability is now
   * `aria-disabled` — announced, styled, and still reachable — and the
   * HUD refuses with words above the unit.
   */
  it("marks unavailable actions, reports the press anyway, and marks the mode", () => {
    const onAction = vi.fn<(action: ActionBarAction) => void>();
    const view = new ActionBarView({ onAction });
    view.mount(root);
    const button = (a: string) =>
      root.querySelector<HTMLButtonElement>(`[data-action="${a}"]`);
    expect(button("attack")?.getAttribute("aria-disabled")).toBe("true");
    view.update({ canAct: true, playerPhase: true, mode: "attack" });
    expect(button("attack")?.getAttribute("aria-disabled")).toBe("false");
    expect(button("attack")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("move")?.getAttribute("aria-pressed")).toBe("false");
    button("move")?.click();
    button("end-turn")?.click();
    expect(onAction.mock.calls.map((c) => c[0])).toEqual(["move", "end-turn"]);

    // Unavailable: marked, and the press still reaches the HUD, which is
    // what lets a refusal say why instead of the click vanishing.
    view.update({ canAct: false, playerPhase: false, mode: undefined });
    expect(button("end-turn")?.getAttribute("aria-disabled")).toBe("true");
    expect(button("end-turn")?.classList.contains("is-unavailable")).toBe(true);
    button("end-turn")?.click();
    expect(onAction.mock.calls.map((c) => c[0])).toEqual([
      "move",
      "end-turn",
      "end-turn",
    ]);
  });

  it("marks every button with its icon", () => {
    const view = new ActionBarView({ onAction: vi.fn() });
    view.mount(root);
    const iconOf = (a: string) =>
      root
        .querySelector<HTMLElement>(`[data-action="${a}"] .tut-icon`)
        ?.style.getPropertyValue("--icon");
    // `iconUrl` already yields `url(…)`; wrapping it again is invalid CSS and
    // the mask silently degrades to a solid block, which is what shipped the
    // first time icons were used (#495).
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
  it("shows turn and phase, a status line, and reports Back", () => {
    const onBack = vi.fn();
    const onLayerStep = vi.fn();
    const view = new TurnBannerView({ onBack, onLayerStep });
    view.mount(root);
    view.update({
      missionName: "Seoul",
      turn: 3,
      phase: "bugs",
      tdfUnits: 2,
      bugUnits: 5,
      layer: { storey: 2, storeyCount: 3 },
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
    root.querySelector<HTMLButtonElement>('[data-action="overworld"]')?.click();
    expect(onBack).toHaveBeenCalled();
  });

  // #961: the player is changing this constantly, so it is a banner stat
  // with buttons beside it rather than something in a menu.
  it("reads out the storey one-based and reports each button", () => {
    const onBack = vi.fn();
    const onLayerStep = vi.fn();
    const view = new TurnBannerView({ onBack, onLayerStep });
    view.mount(root);
    const model = {
      missionName: "Seoul",
      turn: 1,
      phase: "player",
      tdfUnits: 2,
      bugUnits: 0,
    } as const;
    view.update({ ...model, layer: { storey: 2, storeyCount: 3 } });
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
    view.update({ ...model, layer: { storey: 1, storeyCount: 3 } });
    expect(down?.disabled).toBe(true);
    expect(up?.disabled).toBe(false);
    view.update({ ...model, layer: { storey: 3, storeyCount: 3 } });
    expect(down?.disabled).toBe(false);
    expect(up?.disabled).toBe(true);

    // A single-storey map: both ends at once, and the control says so.
    view.update({ ...model, layer: { storey: 1, storeyCount: 1 } });
    expect(field("floor")?.textContent).toBe("1 / 1");
    expect(down?.disabled).toBe(true);
    expect(up?.disabled).toBe(true);

    // No mission at all.
    view.update(undefined);
    expect(field("floor")?.textContent).toBe("—");
    expect(down?.disabled).toBe(true);
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

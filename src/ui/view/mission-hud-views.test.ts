// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "../../core/model/result";
import { CoverLevel } from "../../mapgen/model/cover";
import type { ActionBarAction } from "./action-bar-view";
import { ActionBarView } from "./action-bar-view";
import { HitPreviewView } from "./hit-preview-view";
import { hudMission, hudTemplate, hudUnit } from "./mission-hud.test-helper";
import { ObjectiveTrackerView } from "./objective-tracker-view";
import { TurnBannerView } from "./turn-banner-view";
import { UnitCardView } from "./unit-card-view";

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
    // Charges are per weapon too, and read the same way.
    expect(blocks("charges")).toHaveLength(2);
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
    expect(blocks("charges")).toHaveLength(2);
    // A squad carries no pool at all, so the field falls back.
    view.update(
      hudUnit("s1", "tdf", "rifle", 1, 1),
      hudTemplate("rifle", "Rifle Squad"),
    );
    expect(field("charges")?.textContent).toBe("—");
    // Selecting the mech again has to redraw it: the memo that skips an
    // unchanged rebuild must not still be holding the old key.
    view.update(mech, template);
    expect(blocks("charges")).toHaveLength(2);
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

  it("enables unit actions only when the unit can act, marks the mode and reports presses", () => {
    const onAction = vi.fn<(action: ActionBarAction) => void>();
    const view = new ActionBarView({ onAction });
    view.mount(root);
    const button = (a: string) =>
      root.querySelector<HTMLButtonElement>(`[data-action="${a}"]`);
    expect(button("attack")?.disabled).toBe(true);
    view.update({ canAct: true, playerPhase: true, mode: "attack" });
    expect(button("attack")?.disabled).toBe(false);
    expect(button("attack")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("move")?.getAttribute("aria-pressed")).toBe("false");
    button("move")?.click();
    button("end-turn")?.click();
    expect(onAction.mock.calls.map((c) => c[0])).toEqual(["move", "end-turn"]);
    view.update({ canAct: false, playerPhase: false, mode: undefined });
    expect(button("end-turn")?.disabled).toBe(true);
    button("end-turn")?.click();
    expect(onAction).toHaveBeenCalledTimes(2);
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
});

describe("TurnBannerView", () => {
  it("shows turn and phase, a status line, and reports Back", () => {
    const onBack = vi.fn();
    const view = new TurnBannerView({ onBack });
    view.mount(root);
    view.update({
      missionId: "mission-7",
      turn: 3,
      phase: "bugs",
      tdfUnits: 2,
      bugUnits: 5,
    });
    expect(field("mission-id")?.textContent).toBe("mission-7");
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
});

describe("HitPreviewView", () => {
  it("is hidden without a model, shows the numbers and chips, and reports Fire", () => {
    const onConfirm = vi.fn();
    const view = new HitPreviewView({ onConfirm });
    view.mount(root);
    expect(root.querySelector<HTMLElement>("#hit-preview")?.hidden).toBe(true);
    view.update({
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

  it("shows the refusal and disables Fire", () => {
    const view = new HitPreviewView({ onConfirm: vi.fn() });
    view.mount(root);
    view.update({
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

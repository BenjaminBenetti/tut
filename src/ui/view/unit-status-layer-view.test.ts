// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { UnitStatusLayerView } from "./unit-status-layer-view";

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
});

describe("UnitStatusLayerView", () => {
  it("draws a chip per unit at its anchor, moves it in place, and drops what is gone", () => {
    const view = new UnitStatusLayerView();
    view.mount(root);
    expect(view.isOpen).toBe(false);
    view.show([
      {
        unitId: "u1",
        anchor: { x: 10, y: 20 },
        name: "Alpha",
        team: "tdf",
        hp: 5,
        maxHp: 20,
        charges: [
          { label: "Autocannon", gauge: "heat", value: 4, max: 4 },
          { label: "Missile Pod", gauge: "heat", value: 2, max: 4 },
        ],
      },
      {
        unitId: "b1",
        anchor: { x: 30, y: 40 },
        name: "Swarmer",
        team: "bugs",
        hp: 6,
        maxHp: 6,
        charges: [],
      },
    ]);
    expect(view.isOpen).toBe(true);
    const chip = root.querySelector<HTMLElement>(
      '.tut-status-chip[data-unit-id="u1"]',
    );
    expect(chip?.style.left).toBe("10px");
    expect(chip?.dataset.team).toBe("tdf");
    const fill = chip?.querySelector<HTMLElement>('[data-field="status-hp"]');
    // A quarter left: the danger tone.
    expect(fill?.style.width).toBe("25%");
    expect(fill?.dataset.tone).toBe("danger");
    // The numbers after the bar, and one line per pooled weapon.
    expect(
      chip?.querySelector<HTMLElement>('[data-field="status-hp-text"]')
        ?.textContent,
    ).toBe("5 / 20");
    expect(
      [
        ...(chip?.querySelectorAll<HTMLElement>(
          '[data-field="status-charge"]',
        ) ?? []),
      ].map((row) => row.textContent),
    ).toEqual(["Autocannon · heat 4 / 4", "Missile Pod · heat 2 / 4"]);
    const bug = root.querySelector<HTMLElement>(
      '.tut-status-chip[data-unit-id="b1"]',
    );
    expect(bug?.dataset.team).toBe("bugs");
    expect(
      bug?.querySelector<HTMLElement>('[data-field="status-charges"]')?.hidden,
    ).toBe(true);

    // Moved, not rebuilt: the same element, at the new anchor. And a
    // single pool goes unlabelled: it is just the unit's ammo.
    view.show([
      {
        unitId: "u1",
        anchor: { x: 15, y: 25 },
        name: "Alpha",
        team: "tdf",
        hp: 5,
        maxHp: 20,
        charges: [{ label: "Attack", gauge: "ammo", value: 2, max: 3 }],
      },
    ]);
    expect(root.querySelector('.tut-status-chip[data-unit-id="u1"]')).toBe(
      chip,
    );
    expect(chip?.style.left).toBe("15px");
    expect(
      chip?.querySelector<HTMLElement>('[data-field="status-charge"]')
        ?.textContent,
    ).toBe("ammo 2 / 3");
    expect(root.querySelectorAll(".tut-status-chip")).toHaveLength(1);

    view.hide();
    expect(view.isOpen).toBe(false);
    expect(root.querySelectorAll(".tut-status-chip")).toHaveLength(0);
  });
});

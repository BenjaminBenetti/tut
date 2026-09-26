// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BIOME_INFO } from "../../content/data/biome-info";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { HIVE_TUNING } from "../../overworld/data/hive-tuning";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import type { OverworldSelectionSnapshot } from "../model/overworld-selection";
import { RegionPanelView, UNDETECTED_INFESTATION } from "./region-panel-view";

const newGame = (): GameState =>
  createNewGame(
    { seed: 99, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );

/** The new game with East Asia's cities at the given infestations. */
function eastAsia(infestations: Readonly<Record<string, number>>): GameState {
  const base = newGame();
  return {
    ...base,
    overworld: {
      ...base.overworld,
      map: {
        ...base.overworld.map,
        cities: base.overworld.map.cities.map((c) =>
          infestations[c.id] === undefined
            ? c
            : {
                ...c,
                infestation: infestations[c.id]!,
                detected: infestations[c.id]! > 0,
              },
        ),
      },
    },
  };
}

const DEPS = { hiveTuning: HIVE_TUNING };

const pick = (
  regionId: string | undefined,
  cityId: string | undefined = undefined,
): OverworldSelectionSnapshot => ({ regionId, cityId, missionId: undefined });

describe("RegionPanelView", () => {
  let root: HTMLElement;
  const field = (name: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-field="${name}"]`);
  const rows = (): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>("[data-city-id]"),
  ];

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("shows the placeholder with no selection, no campaign, or an unknown region", () => {
    const view = new RegionPanelView({ onSelectCity: vi.fn() }, DEPS);
    view.mount(root);
    view.update(newGame(), pick(undefined));
    expect(root.querySelector("#selected-region")?.textContent).toBe("—");
    expect(
      root.querySelector<HTMLElement>('[data-role="no-region"]')?.hidden,
    ).toBe(false);
    view.update(undefined, pick("east-asia"));
    expect(
      root.querySelector<HTMLElement>('[data-role="no-region"]')?.hidden,
    ).toBe(false);
    view.update(newGame(), pick("atlantis"));
    expect(root.querySelector("#selected-region")?.textContent).toBe("—");
    expect(rows()).toHaveLength(0);
  });

  it("renders the region name, biome, worst and mean infestation with a toned meter", () => {
    const view = new RegionPanelView({ onSelectCity: vi.fn() }, DEPS);
    view.mount(root);
    view.update(
      eastAsia({ tokyo: 62, seoul: 37, beijing: 24 }),
      pick("east-asia", "tokyo"),
    );
    expect(root.querySelector("#selected-region")?.textContent).toBe(
      "East Asia",
    );
    expect(field("biome")?.textContent).toBe(BIOME_INFO.temperate.name);
    expect(field("worst")?.textContent).toBe("62");
    expect(field("mean")?.textContent).toBe("41");
    const meter = field("worst-meter");
    expect(meter?.classList.contains("tut-meter--warn")).toBe(true);
    expect(meter?.dataset.tone).toBe("warn");
    expect(
      meter
        ?.querySelector<HTMLElement>(".tut-meter__fill")
        ?.style.getPropertyValue("--value"),
    ).toBe("62%");
    expect(
      root.querySelector<HTMLElement>('[data-role="no-region"]')?.hidden,
    ).toBe(true);
  });

  it("tints the meter by the worst city's band", () => {
    const view = new RegionPanelView({ onSelectCity: vi.fn() }, DEPS);
    view.mount(root);
    view.update(
      eastAsia({ tokyo: 0, seoul: 0, beijing: 0 }),
      pick("east-asia"),
    );
    expect(field("worst-meter")?.dataset.tone).toBe("ok");
    view.update(eastAsia({ tokyo: 90 }), pick("east-asia"));
    expect(field("worst-meter")?.dataset.tone).toBe("danger");
    expect(field("worst-meter")?.classList.contains("tut-meter--danger")).toBe(
      true,
    );
  });

  it("shows the region's hive with its level today, and nothing for a region without one", () => {
    const view = new RegionPanelView({ onSelectCity: vi.fn() }, DEPS);
    view.mount(root);
    const hive = (): HTMLElement | null => field("hive");

    view.update(newGame(), pick("east-asia"));
    expect(hive()?.hidden).toBe(true);

    const base = eastAsia({ tokyo: 80, seoul: 70, beijing: 60 });
    const hived: GameState = {
      ...base,
      overworld: {
        ...base.overworld,
        day: 44,
        hives: [{ id: "hive-1", regionId: "east-asia", formedDay: 30 }],
      },
    };
    view.update(hived, pick("east-asia"));
    expect(hive()?.hidden).toBe(false);
    expect(field("hive-label")?.textContent).toBe("Hive (level 2)");
    expect(hive()?.title).toBe("Formed on day 30. Gains a level every 7 days.");
    expect(
      hive()?.querySelector<HTMLElement>('[data-icon="marker-hive"]'),
    ).not.toBeNull();

    const otherRegion = EARTH_MAP.regions.find((r) => r.id !== "east-asia");
    view.update(hived, pick(otherRegion?.id));
    expect(hive()?.hidden).toBe(true);
    expect(hive()?.hasAttribute("title")).toBe(false);
  });

  it("lists every city in region order with scale and toned infestation, the selected one current", () => {
    const view = new RegionPanelView({ onSelectCity: vi.fn() }, DEPS);
    view.mount(root);
    view.update(
      eastAsia({ tokyo: 62, seoul: 7, beijing: 88 }),
      pick("east-asia", "seoul"),
    );
    expect(rows().map((r) => r.dataset.cityId)).toEqual([
      "beijing",
      "seoul",
      "tokyo",
    ]);
    const seoul = rows()[1]!;
    expect(seoul.getAttribute("aria-current")).toBe("true");
    expect(rows()[0]?.hasAttribute("aria-current")).toBe(false);
    expect(seoul.querySelector('[data-field="city-name"]')?.textContent).toBe(
      "Seoul",
    );
    expect(seoul.querySelector('[data-field="city-scale"]')?.textContent).toBe(
      "city",
    );
    const infestation = seoul.querySelector<HTMLElement>(
      '[data-field="city-infestation"]',
    );
    expect(infestation?.textContent).toBe("7");
    expect(infestation?.dataset.tone).toBe("ok");
    expect(
      rows()[0]?.querySelector<HTMLElement>('[data-field="city-infestation"]')
        ?.dataset.tone,
    ).toBe("danger");
  });

  it("hides an undetected city's infestation behind a question mark with no tone (GDD §5.3)", () => {
    const view = new RegionPanelView({ onSelectCity: vi.fn() }, DEPS);
    view.mount(root);
    const base = eastAsia({ tokyo: 62, seoul: 40, beijing: 0 });
    const hidden: GameState = {
      ...base,
      overworld: {
        ...base.overworld,
        map: {
          ...base.overworld.map,
          cities: base.overworld.map.cities.map((c) =>
            c.id === "seoul" ? { ...c, detected: false } : c,
          ),
        },
      },
    };
    view.update(hidden, pick("east-asia"));
    const cell = (id: string) =>
      rows()
        .find((row) => row.dataset.cityId === id)
        ?.querySelector<HTMLElement>('[data-field="city-infestation"]');
    expect(cell("seoul")?.textContent).toBe(UNDETECTED_INFESTATION);
    expect(cell("seoul")?.dataset.tone).toBeUndefined();
    expect(cell("tokyo")?.textContent).toBe("62");
    expect(cell("tokyo")?.dataset.tone).toBe("warn");
    // A clean city is undetected too, so the row never leaks where the next landing is.
    expect(cell("beijing")?.textContent).toBe(UNDETECTED_INFESTATION);
    // The region's meter still counts the hidden city (mean of 62, 40, 0).
    expect(root.querySelector('[data-field="mean"]')?.textContent).toBe("34");
    // Detection flips the row back to its number and tone.
    view.update(base, pick("east-asia"));
    expect(cell("seoul")?.textContent).toBe("40");
    expect(cell("seoul")?.dataset.tone).toBe("warn");
  });

  it("reuses rows across updates and moves the current mark with the selection", () => {
    const view = new RegionPanelView({ onSelectCity: vi.fn() }, DEPS);
    view.mount(root);
    view.update(eastAsia({ tokyo: 10 }), pick("east-asia", "tokyo"));
    const before = rows();
    view.update(eastAsia({ tokyo: 11 }), pick("east-asia", "beijing"));
    const after = rows();
    expect(after[2]).toBe(before[2]);
    expect(after[2]?.hasAttribute("aria-current")).toBe(false);
    expect(after[0]?.getAttribute("aria-current")).toBe("true");
    expect(
      after[2]?.querySelector('[data-field="city-infestation"]')?.textContent,
    ).toBe("11");
    view.update(eastAsia({}), pick("oceania"));
    expect(rows().map((r) => r.dataset.cityId)).toEqual([
      "alice-springs",
      "perth",
      "sydney",
      "auckland",
    ]);
  });

  it("a click or Enter on a row selects that city", () => {
    const onSelectCity = vi.fn();
    const view = new RegionPanelView({ onSelectCity }, DEPS);
    view.mount(root);
    view.update(newGame(), pick("east-asia"));
    rows()[2]
      ?.querySelector<HTMLElement>('[data-field="city-name"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectCity).toHaveBeenCalledWith("tokyo");
    rows()[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(onSelectCity).toHaveBeenLastCalledWith("beijing");
    root
      .querySelector('[data-role="city-list"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectCity).toHaveBeenCalledTimes(2);
  });

  it("focus lands on the card and unmount removes it with its listeners", () => {
    const onSelectCity = vi.fn();
    const view = new RegionPanelView({ onSelectCity }, DEPS);
    view.mount(root);
    view.update(newGame(), pick("east-asia"));
    view.focus();
    expect(document.activeElement?.id).toBe("region-panel");
    const list = root.querySelector('[data-role="city-list"]');
    view.unmount();
    expect(root.querySelector("#region-panel")).toBeNull();
    list
      ?.querySelector("[data-city-id]")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectCity).not.toHaveBeenCalled();
  });
});

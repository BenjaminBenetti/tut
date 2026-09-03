// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { City } from "../../overworld/model/city";
import type { Mission } from "../../overworld/model/mission";
import { regionInfestation } from "../../overworld/service/threat-service";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { activeMission, CityPanelView } from "./city-panel-view";

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

/** The first shipped city; the map is content, so a missing one is a data bug. */
function firstCity(): City {
  const city = EARTH_MAP.cities[0];
  if (!city) throw new Error("fixture map has no cities");
  return city;
}
const CITY = firstCity();

const mission = (id: string, expiresDay: number): Mission => ({
  id,
  typeId: "infestation-clearance",
  cityId: CITY.id,
  difficulty: 4,
  mapParams: {
    biome: "temperate",
    settlement: "city",
    size: "medium",
    seed: id,
  },
  rewards: { credits: 1200 },
  createdDay: 1,
  expiresDay,
  ignorePenalty: 10,
});

/** The new game with the first city at the given infestation and missions. */
function stateWith(infestation: number, missions: Mission[] = []): GameState {
  const base = newGame();
  return {
    ...base,
    overworld: {
      ...base.overworld,
      missions,
      map: {
        ...base.overworld.map,
        cities: base.overworld.map.cities.map((c) =>
          c.id === CITY.id ? { ...c, infestation } : c,
        ),
      },
    },
  };
}

describe("CityPanelView", () => {
  let root: HTMLElement;
  const field = (name: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-field="${name}"]`);

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("shows the placeholder with no selection and with no campaign", () => {
    const view = new CityPanelView({ onPlanDeployment: vi.fn() });
    view.mount(root);
    view.update(newGame(), undefined);
    expect(root.querySelector("#selected-city")?.textContent).toBe("—");
    expect(
      root.querySelector<HTMLElement>('[data-role="no-city"]')?.hidden,
    ).toBe(false);
    view.update(undefined, CITY.id);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-city"]')?.hidden,
    ).toBe(false);
    view.update(newGame(), "atlantis");
    expect(root.querySelector("#selected-city")?.textContent).toBe("—");
  });

  it("renders name, region, scale, infestation meter and the region mean", () => {
    const view = new CityPanelView({ onPlanDeployment: vi.fn() });
    view.mount(root);
    const state = stateWith(62);
    view.update(state, CITY.id);
    expect(root.querySelector("#selected-city")?.textContent).toBe(CITY.name);
    expect(field("region")?.textContent).toBe(
      EARTH_MAP.regions.find((r) => r.id === CITY.regionId)?.name,
    );
    expect(field("scale")?.textContent).toBe(CITY.scale);
    expect(field("infestation")?.textContent).toBe("62");
    expect(field("region-mean")?.textContent).toBe(
      String(Math.round(regionInfestation(state.overworld.map, CITY.regionId))),
    );
    const fill = root.querySelector<HTMLElement>(
      '[data-field="infestation-meter"] .tut-meter__fill',
    );
    expect(fill?.style.getPropertyValue("--value")).toBe("62%");
    expect(field("mission")?.textContent).toBe("No active mission");
    expect(
      root.querySelector<HTMLElement>('[data-action="plan-deployment"]')
        ?.hidden,
    ).toBe(true);
  });

  it("summarises the soonest-expiring mission and reports Plan deployment with its id", () => {
    const onPlanDeployment = vi.fn();
    const view = new CityPanelView({ onPlanDeployment });
    view.mount(root);
    view.update(
      stateWith(10, [mission("mission-2", 9), mission("mission-1", 6)]),
      CITY.id,
    );
    expect(field("mission")?.textContent).toBe(
      "Infestation Clearance · difficulty 4 · ¢1,200 · expires day 6",
    );
    const plan = root.querySelector<HTMLButtonElement>(
      '[data-action="plan-deployment"]',
    );
    expect(plan?.hidden).toBe(false);
    plan?.click();
    expect(onPlanDeployment).toHaveBeenCalledWith("mission-1");
  });

  it("unmount removes the card", () => {
    const view = new CityPanelView({ onPlanDeployment: vi.fn() });
    view.mount(root);
    view.unmount();
    expect(root.querySelector("#city-panel")).toBeNull();
  });
});

describe("activeMission", () => {
  it("picks the city's soonest-expiring mission", () => {
    const state = stateWith(0, [
      mission("a", 8),
      mission("b", 5),
      { ...mission("c", 2), cityId: "elsewhere" },
    ]);
    expect(activeMission(state, CITY.id)?.id).toBe("b");
    expect(activeMission(stateWith(0), CITY.id)).toBeUndefined();
  });
});

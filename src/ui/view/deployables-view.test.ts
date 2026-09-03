// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Deployable } from "../../overworld/model/deployable";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import type { Region } from "../../overworld/model/region";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { DeployablesView } from "./deployables-view";

const CATALOGUE = new DataDeployableTypeCatalogue(
  DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
);
/** The first shipped region; the map is content, so a missing one is a data bug. */
function firstRegion(): Region {
  const region = EARTH_MAP.regions[0];
  if (!region) throw new Error("fixture map has no regions");
  return region;
}
const REGION = firstRegion();
const BATTERY = DEPLOYABLE_TYPES["defensive-battery"];

const newGame = (): GameState =>
  createNewGame(
    { seed: 5, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );

function stateWith(deployables: Deployable[], credits: number): GameState {
  const base = newGame();
  return {
    ...base,
    overworld: { ...base.overworld, deployables },
    economy: { ...base.economy, credits },
  };
}

const built = (
  id: string,
  typeId: Deployable["typeId"],
  online = true,
): Deployable => ({
  id,
  typeId,
  regionId: REGION.id,
  builtDay: 1,
  online,
});

describe("DeployablesView", () => {
  let root: HTMLElement;
  const buildButton = (typeId: string): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>(
      `[data-action="build-deployable"][data-type-id="${typeId}"]`,
    );

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("shows the placeholder with no region or no campaign", () => {
    const view = new DeployablesView(
      { onBuild: vi.fn(), onDecommission: vi.fn() },
      CATALOGUE,
    );
    view.mount(root);
    view.update(newGame(), undefined);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-region"]')?.hidden,
    ).toBe(false);
    view.update(undefined, REGION.id);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-region"]')?.hidden,
    ).toBe(false);
    expect(
      root.querySelector<HTMLElement>('[data-role="build-options"]')?.hidden,
    ).toBe(true);
  });

  it("lists the region's installations with status and upkeep, and one Build button per type", () => {
    const view = new DeployablesView(
      { onBuild: vi.fn(), onDecommission: vi.fn() },
      CATALOGUE,
    );
    view.mount(root);
    view.update(
      stateWith(
        [
          built("d1", "defensive-battery"),
          built("d2", "sensor-array", false),
          { ...built("d3", "sensor-array"), regionId: "elsewhere" },
        ],
        5000,
      ),
      REGION.id,
    );
    expect(
      root.querySelector('[data-field="deployables-region"]')?.textContent,
    ).toBe(REGION.name);
    const rows = [
      ...root.querySelectorAll<HTMLElement>("[data-deployable-id]"),
    ];
    expect(rows.map((r) => r.dataset.deployableId)).toEqual(["d1", "d2"]);
    expect(rows[0]?.textContent).toContain("Defensive battery");
    expect(rows[0]?.querySelector('[data-field="status"]')?.textContent).toBe(
      "online",
    );
    expect(rows[0]?.textContent).toContain(
      `¢${String(BATTERY.upkeepPerDay)}/day`,
    );
    expect(rows[1]?.querySelector('[data-field="status"]')?.textContent).toBe(
      "offline",
    );
    const builds = root.querySelectorAll('[data-action="build-deployable"]');
    expect(builds).toHaveLength(DEPLOYABLE_TYPE_IDS.length);
    expect(buildButton("defensive-battery")?.textContent).toBe(
      "Build Defensive battery · ¢1,500 · 1/2",
    );
  });

  it("disables Build when capped or unaffordable, with the reason in the title", () => {
    const view = new DeployablesView(
      { onBuild: vi.fn(), onDecommission: vi.fn() },
      CATALOGUE,
    );
    view.mount(root);
    view.update(stateWith([built("d1", "sensor-array")], 900), REGION.id);
    const sensor = buildButton("sensor-array");
    expect(sensor?.disabled).toBe(true);
    expect(sensor?.title).toContain("cap");
    const battery = buildButton("defensive-battery");
    expect(battery?.disabled).toBe(true);
    expect(battery?.title).toContain("Need ¢1,500");
    const repellent = buildButton("repellent-dispersal");
    expect(repellent?.disabled).toBe(true);
    view.update(stateWith([], 5000), REGION.id);
    expect(buildButton("sensor-array")?.disabled).toBe(false);
    expect(buildButton("defensive-battery")?.disabled).toBe(false);
  });

  it("reports Build with the type and region, and Decommission with the id", () => {
    const onBuild = vi.fn();
    const onDecommission = vi.fn();
    const view = new DeployablesView({ onBuild, onDecommission }, CATALOGUE);
    view.mount(root);
    view.update(stateWith([built("d1", "sensor-array")], 5000), REGION.id);
    buildButton("defensive-battery")?.click();
    expect(onBuild).toHaveBeenCalledWith("defensive-battery", REGION.id);
    buildButton("sensor-array")?.click();
    expect(onBuild).toHaveBeenCalledTimes(1);
    root
      .querySelector<HTMLButtonElement>(
        '[data-action="decommission-deployable"]',
      )
      ?.click();
    expect(onDecommission).toHaveBeenCalledWith("d1");
  });

  it("unmount removes the section and stops listening", () => {
    const onBuild = vi.fn();
    const view = new DeployablesView(
      { onBuild, onDecommission: vi.fn() },
      CATALOGUE,
    );
    view.mount(root);
    view.update(stateWith([], 5000), REGION.id);
    const button = buildButton("sensor-array");
    view.unmount();
    expect(root.querySelector("#deployables")).toBeNull();
    button?.click();
    expect(onBuild).not.toHaveBeenCalled();
  });
});

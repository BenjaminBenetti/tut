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
import { POPOVER_ID, popoverFor } from "./popover-view";

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
  level: Deployable["level"] = 1,
): Deployable => ({
  id,
  typeId,
  regionId: REGION.id,
  level,
  builtDay: 1,
  online,
});

const popover = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-role="popover"]');

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
      { onBuild: vi.fn(), onDecommission: vi.fn(), onUpgrade: vi.fn() },
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
      { onBuild: vi.fn(), onDecommission: vi.fn(), onUpgrade: vi.fn() },
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
      `¢${String(BATTERY.levels[1].upkeepPerDay)}/day`,
    );
    expect(rows[1]?.querySelector('[data-field="status"]')?.textContent).toBe(
      "offline",
    );
    const builds = root.querySelectorAll('[data-action="build-deployable"]');
    expect(builds).toHaveLength(DEPLOYABLE_TYPE_IDS.length);
    expect(buildButton("defensive-battery")?.textContent).toBe(
      "Defensive battery · L1 · ¢1,500 · 1/1",
    );
    const heading = root.querySelector('[data-role="build-heading"]');
    expect(heading?.textContent).toBe("Build");
    expect(heading?.className).toBe("tut-label");
    expect(
      root.querySelector('[data-role="build-options"]')?.firstElementChild,
    ).toBe(heading);
  });

  it("disables Build when capped or unaffordable, with the reason in the title", () => {
    const view = new DeployablesView(
      { onBuild: vi.fn(), onDecommission: vi.fn(), onUpgrade: vi.fn() },
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
    const view = new DeployablesView({ onBuild, onDecommission, onUpgrade: vi.fn() }, CATALOGUE);
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

  it("offers Upgrade on each row with the next level's price, disabled with the reason at the top or when unaffordable (#1155)", () => {
    const onUpgrade = vi.fn();
    const view = new DeployablesView(
      { onBuild: vi.fn(), onDecommission: vi.fn(), onUpgrade },
      CATALOGUE,
    );
    view.mount(root);
    view.update(
      stateWith(
        [
          built("d1", "defensive-battery"),
          built("d2", "sensor-array", true, 3),
          built("d3", "bank", true, 2),
        ],
        1600,
      ),
      REGION.id,
    );
    const upgrades = [
      ...root.querySelectorAll<HTMLButtonElement>(
        '[data-action="upgrade-deployable"]',
      ),
    ];
    expect(upgrades.map((b) => b.textContent)).toEqual([
      "Upgrade · ¢1,500",
      "Upgrade",
      "Upgrade · ¢2,000",
    ]);
    expect(upgrades[0]?.disabled).toBe(false);
    expect(upgrades[0]?.title).toBe("Upgrade to L2");
    expect(upgrades[1]?.disabled).toBe(true);
    expect(upgrades[1]?.title).toBe("Max level");
    expect(upgrades[2]?.disabled).toBe(true);
    expect(upgrades[2]?.title).toBe("Need ¢2,000, have ¢1,600");
    expect(
      root.querySelector('[data-deployable-id="d3"] [data-field="level"]')
        ?.textContent,
    ).toBe("L2");
    expect(
      root.querySelector('[data-deployable-id="d3"] [data-field="type-name"]')
        ?.textContent,
    ).toBe("Bank");
    upgrades[0]?.click();
    expect(onUpgrade).toHaveBeenCalledWith("d1");
    upgrades[2]?.click();
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it("resting on a Build option or an installed row opens the popover for it (#1155)", () => {
    const view = new DeployablesView(
      { onBuild: vi.fn(), onDecommission: vi.fn(), onUpgrade: vi.fn() },
      CATALOGUE,
    );
    view.mount(root);
    view.update(stateWith([built("d1", "sensor-array")], 900), REGION.id);
    const option = root.querySelector<HTMLElement>(
      '[data-role="build-option"][data-type-id="defensive-battery"]',
    );
    expect(option?.contains(buildButton("defensive-battery"))).toBe(true);
    option?.dispatchEvent(new Event("mouseenter"));
    let shown = popover();
    expect(shown?.hidden).toBe(false);
    expect(shown?.querySelector(".tut-popover__title")?.textContent).toBe(
      "Defensive battery",
    );
    const lines = (): string[] =>
      [...(popover()?.querySelectorAll(".tut-popover__line") ?? [])].map(
        (l) => l.textContent ?? "",
      );
    expect(lines()).toEqual([
      "1 garrison turret on every mission map",
      "Build ¢1,500 · upkeep ¢50/day",
      "1 per region · 0/1 built",
      "Need ¢1,500, have ¢900",
    ]);
    expect(option?.getAttribute("aria-describedby")).toBe(POPOVER_ID);
    option?.dispatchEvent(new Event("mouseleave"));
    expect(popover()?.hidden).toBe(true);

    const row = root.querySelector<HTMLElement>('[data-deployable-id="d1"]');
    row?.dispatchEvent(new Event("mouseenter"));
    shown = popover();
    expect(shown?.hidden).toBe(false);
    expect(shown?.querySelector(".tut-popover__title")?.textContent).toBe(
      "Sensor array · L1 · online",
    );
    expect(lines()).toEqual([
      "Finds infested cities at 60% of the usual infestation",
      "Missions stay on offer 1 day longer",
      "Upkeep ¢20/day",
      "Upgrade to L2 · ¢1,000 · upkeep ¢35/day",
      "Finds infested cities at 40% of the usual infestation (from 60%)",
      "Missions stay on offer 2 days longer (from 1 day)",
    ]);
    // A re-render replaces the row under the pointer; the popover goes with it.
    view.update(stateWith([built("d1", "sensor-array")], 900), REGION.id);
    expect(popover()?.hidden).toBe(true);
    popoverFor(document).dispose();
  });

  it("unmount removes the section and stops listening", () => {
    const onBuild = vi.fn();
    const view = new DeployablesView(
      { onBuild, onDecommission: vi.fn(), onUpgrade: vi.fn() },
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

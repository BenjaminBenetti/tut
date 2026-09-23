// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { MissionDetailsView } from "./mission-details-view";
import { campaignOnDay, missionAt } from "./mission-fixtures.test-helper";

describe("MissionDetailsView", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const section = (): HTMLElement | null =>
    root.querySelector<HTMLElement>('[data-role="mission-details"]');
  const field = (name: string): string =>
    root.querySelector(`[data-field="detail-${name}"]`)?.textContent ?? "";

  it("names the tech reward and a reported carcass (#1171)", () => {
    const view = new MissionDetailsView(
      { missionTypes: MISSION_TYPES },
      { onPlanDeployment: vi.fn() },
    );
    view.mount(root);
    const base = missionAt("mission-1", "cairo", 7, 4);
    const mission = {
      ...base,
      rewards: { ...base.rewards, techPoints: 23 },
      mapParams: { ...base.mapParams, techCarcass: { techPoints: 5 } },
    };
    view.update(campaignOnDay(4, [mission]), mission);
    expect(field("tech")).toBe("+23 TP");
    expect(field("carcass")).toBe("Reported · +5 TP");
  });

  it("is hidden until a mission is shown, then fills the briefing", () => {
    const view = new MissionDetailsView(
      { missionTypes: MISSION_TYPES },
      { onPlanDeployment: vi.fn() },
    );
    view.mount(root);
    expect(section()?.hidden).toBe(true);
    const mission = missionAt("mission-1", "cairo", 7, 4);
    view.update(campaignOnDay(4, [mission]), mission);
    expect(section()?.hidden).toBe(false);
    expect(section()?.dataset.missionId).toBe("mission-1");
    expect(field("type")).toBe("Infestation Clearance");
    expect(field("city")).toBe("Cairo");
    expect(field("difficulty")).toBe("D4");
    expect(field("reward")).toBe("¢1,200");
    expect(field("tech")).toBe("+0 TP");
    expect(field("carcass")).toBe("None reported");
    expect(field("days-left")).toBe("3 d");
    expect(field("biome")).toBe("Desert");
    expect(field("settlement")).toBe("town");
    expect(field("size")).toBe("medium");
    expect(field("penalty")).toBe("+10 infestation");
    expect(root.querySelector('[data-field="description"]')?.textContent).toBe(
      MISSION_TYPES["infestation-clearance"].description,
    );
  });

  it("hides again when the mission goes away and reports Plan deployment with the id", () => {
    const onPlanDeployment = vi.fn();
    const view = new MissionDetailsView(
      { missionTypes: MISSION_TYPES },
      { onPlanDeployment },
    );
    view.mount(root);
    const mission = missionAt("mission-1", "cairo", 7);
    view.update(campaignOnDay(4, [mission]), mission);
    root
      .querySelector<HTMLButtonElement>('[data-action="plan-deployment"]')
      ?.click();
    expect(onPlanDeployment).toHaveBeenCalledWith("mission-1");
    view.update(campaignOnDay(4, []), undefined);
    expect(section()?.hidden).toBe(true);
    root
      .querySelector<HTMLButtonElement>('[data-action="plan-deployment"]')
      ?.click();
    expect(onPlanDeployment).toHaveBeenCalledTimes(1);
  });
});

describe("MissionDetailsView on a defence (#1175)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const field = (name: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-field="detail-${name}"]`);

  it("names the installation, its generators and the wave count, and hides them again on a clearance", () => {
    const view = new MissionDetailsView(
      { missionTypes: MISSION_TYPES },
      { onPlanDeployment: vi.fn() },
    );
    view.mount(root);
    const base = missionAt("mission-1", "cairo", 7, 4);
    const defence = {
      ...base,
      typeId: "defend-installation" as const,
      defence: {
        installation: "repellent-dispersal" as const,
        deployableId: "deployable-1",
        generators: 4,
        waves: 5,
      },
    };
    view.update(campaignOnDay(4, [defence]), defence);
    expect(field("type")?.textContent).toBe(
      MISSION_TYPES["defend-installation"].name,
    );
    expect(field("installation")?.textContent).toBe(
      "Repellent dispersal · 4 generators",
    );
    expect(field("waves")?.textContent).toBe("5 timed waves");
    expect(field("installation")?.hidden).toBe(false);
    expect(field("waves")?.hidden).toBe(false);

    view.update(campaignOnDay(4, [base]), base);
    expect(field("installation")?.hidden).toBe(true);
    expect(field("waves")?.hidden).toBe(true);
  });
});

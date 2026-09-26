// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import type { MissionPresentationCatalogue } from "../model/mission-presentation";
import { NO_COUNTDOWN_TEXT } from "../service/mission-countdown";
import { MISSION_PRESENTATION } from "../service/missions/mission-presentation";
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

  it("tags the offer's sitreps above the grid, and hides them for an offer without (#1179)", () => {
    const view = new MissionDetailsView(
      { missionTypes: MISSION_TYPES },
      { onPlanDeployment: vi.fn() },
    );
    view.mount(root);
    const plain = missionAt("mission-1", "cairo", 7, 4);
    const tagged = {
      ...missionAt("mission-2", "lagos", 7, 4),
      sitreps: ["city-ablaze", "local-guides"] as const,
    };
    const state = campaignOnDay(4, [plain, tagged]);
    const sitreps = (): HTMLElement | null =>
      root.querySelector<HTMLElement>('[data-role="sitreps"]');
    view.update(state, plain);
    expect(sitreps()?.hidden).toBe(true);
    view.update(state, tagged);
    expect(sitreps()?.hidden).toBe(false);
    const tags = [...root.querySelectorAll<HTMLElement>("[data-sitrep]")];
    expect(tags.map((tag) => tag.dataset.sitrep)).toEqual([
      "city-ablaze",
      "local-guides",
    ]);
    expect(tags[1]?.textContent).toContain("Helps you");
    // Between the description and the grid.
    const order = [...section()!.children].map(
      (child) =>
        (child as HTMLElement).dataset.role ??
        (child as HTMLElement).dataset.field ??
        child.tagName,
    );
    expect(order.indexOf("sitreps")).toBe(order.indexOf("description") + 1);
    view.update(state, plain);
    expect(sitreps()?.hidden).toBe(true);
  });

  it("shows no countdown for a pinned offer (ADR 0013 §2.2)", () => {
    const view = new MissionDetailsView(
      { missionTypes: MISSION_TYPES },
      { onPlanDeployment: vi.fn() },
    );
    view.mount(root);
    const pinned = { ...missionAt("mission-1", "cairo", 5, 4), pinned: true };
    view.update(campaignOnDay(4, [pinned]), pinned);
    expect(field("days-left")).toBe(NO_COUNTDOWN_TEXT);
  });

  it("heads a story mission's briefing with its title (arc §6.9)", () => {
    const view = new MissionDetailsView(
      { missionTypes: MISSION_TYPES },
      { onPlanDeployment: vi.fn() },
    );
    view.mount(root);
    const heading = (): string =>
      root.querySelector('[data-field="briefing-heading"]')?.textContent ?? "";
    const drawn = missionAt("mission-1", "cairo", 5, 1);
    view.update(campaignOnDay(4, [drawn]), drawn);
    expect(heading()).toBe("Briefing");
    const story = {
      ...missionAt("mission-2", "lagos", 5, 1),
      typeId: "crash-site" as const,
      storyId: "first-skyfall" as const,
      pinned: true,
    };
    view.update(campaignOnDay(4, [drawn, story]), story);
    expect(heading()).toBe("Briefing · First Skyfall");
    view.update(campaignOnDay(4, [drawn, story]), drawn);
    expect(heading()).toBe("Briefing");
  });

  it("briefs Live Specimen in its own words: the rows, the line and the title, and a plain clearance shows none of it (#1179)", () => {
    const view = new MissionDetailsView(
      { missionTypes: MISSION_TYPES },
      { onPlanDeployment: vi.fn() },
    );
    view.mount(root);
    const plain = missionAt("mission-1", "cairo", 7, 3);
    const specimen = {
      ...missionAt("mission-2", "lagos", 7, 3),
      storyId: "live-specimen" as const,
      pinned: true,
      act: "act-1" as const,
    };
    const state = campaignOnDay(4, [plain, specimen]);
    const shown = (name: string): boolean =>
      root.querySelector<HTMLElement>(`[data-field="detail-${name}"]`)
        ?.hidden === false;
    const term = (name: string): string =>
      root.querySelector(`[data-field="detail-${name}"]`)
        ?.previousElementSibling?.textContent ?? "";
    const description = (): string =>
      root.querySelector('[data-field="description"]')?.textContent ?? "";

    view.update(state, specimen);
    expect(
      root.querySelector('[data-field="briefing-heading"]')?.textContent,
    ).toBe("Briefing · Live Specimen");
    expect(field("type")).toBe("Infestation Clearance");
    expect([
      [term("story-objective"), field("story-objective")],
      [term("story-win"), field("story-win")],
      [term("story-kit"), field("story-kit")],
    ]).toEqual([
      ["Objective", "Net a lurker at 50% HP or less, then bring it home"],
      ["Win", "Act I ends"],
      ["Kit", "Every squad carries a capture net"],
    ]);
    expect(description()).toContain("The lab needs a lurker alive.");
    expect(description()).not.toBe(
      MISSION_TYPES["infestation-clearance"].description,
    );
    // The story rows sit ahead of the type's, straight after the lead.
    const fields = [
      ...root.querySelectorAll<HTMLElement>("dd[data-field]"),
    ].map((dd) => dd.dataset.field);
    expect(fields.indexOf("detail-story-objective")).toBe(
      fields.indexOf("detail-carcass") + 1,
    );

    view.update(state, plain);
    expect(shown("story-objective")).toBe(false);
    expect(shown("story-win")).toBe(false);
    expect(shown("story-kit")).toBe(false);
    expect(description()).toBe(
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

describe("MissionDetailsView briefs through MISSION_PRESENTATION (ADR 0013 §2.3)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("builds a slot per declared field and fills what the mission's type answers", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const briefingRows = vi.fn(() => [
      { field: "hives", label: "Hive count", value: "3 hives" },
    ]);
    // A field no shipped type declares, so only the injected table can
    // put it in the grid.
    const presentations: MissionPresentationCatalogue = {
      ...MISSION_PRESENTATION,
      "infestation-clearance": {
        ...MISSION_PRESENTATION["infestation-clearance"],
        briefingFields: [{ field: "hives", label: "Hives" }],
        briefingRows,
      },
    };
    const view = new MissionDetailsView(
      { missionTypes: MISSION_TYPES, presentations },
      { onPlanDeployment: vi.fn() },
    );
    view.mount(root);
    const cell = (name: string): HTMLElement | null =>
      root.querySelector<HTMLElement>(`[data-field="detail-${name}"]`);
    expect(cell("hives")).not.toBeNull();

    const mission = missionAt("mission-1", "cairo", 7, 4);
    const state = campaignOnDay(4, [mission]);
    view.update(state, mission);
    expect(briefingRows).toHaveBeenCalledWith(mission, { state });
    expect(cell("hives")?.textContent).toBe("3 hives");
    expect(cell("hives")?.hidden).toBe(false);
    expect(cell("hives")?.previousElementSibling?.textContent).toBe(
      "Hive count",
    );
    // The shipped type's own slots stay, empty and hidden, for a type
    // that does not fill them.
    expect(cell("installation")?.hidden).toBe(true);
    expect(cell("installation")?.textContent).toBe("");
  });
});

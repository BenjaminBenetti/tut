// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { campaignOnDay } from "./mission-fixtures.test-helper";
import type { DeploymentPickerModel } from "./deployment-picker-view";
import { DeploymentPickerView } from "./deployment-picker-view";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";

describe("DeploymentPickerView", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const build = () => {
    const onToggleSquad = vi.fn();
    const onToggleMech = vi.fn();
    const view = new DeploymentPickerView(
      { squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES) },
      { onToggleSquad, onToggleMech },
    );
    view.mount(root);
    return { view, onToggleSquad, onToggleMech };
  };

  const model = (
    over: Partial<DeploymentPickerModel> = {},
  ): DeploymentPickerModel => {
    const state = campaignOnDay(1, []);
    return {
      squads: state.roster.squads,
      mechs: state.roster.mechs,
      selectedSquadIds: new Set(),
      selectedMechIds: new Set(),
      assessment: { force: 12, target: 30, winProbability: 0.7 },
      maxUnits: MAX_DEPLOYED_UNITS,
      ...over,
    };
  };

  it("renders a row per squad and mech with strength, type and damage", () => {
    const { view } = build();
    const m = model();
    view.update(m);
    const squadRows = root.querySelectorAll("#deploy-squads tbody tr");
    expect(squadRows).toHaveLength(m.squads.length);
    const first = squadRows[0];
    expect(first?.getAttribute("data-squad-id")).toBe(m.squads[0]?.id);
    expect(first?.querySelector('[data-field="cell-0"]')?.textContent).toBe(
      m.squads[0]?.name,
    );
    expect(first?.querySelector('[data-field="cell-1"]')?.textContent).toBe(
      "Rifle Squad",
    );
    expect(first?.querySelector('[data-field="cell-2"]')?.textContent).toBe(
      "5/5",
    );
    const mechRows = root.querySelectorAll("#deploy-mechs tbody tr");
    expect(mechRows).toHaveLength(m.mechs.length);
    expect(
      mechRows[0]?.querySelector('[data-field="cell-1"]')?.textContent,
    ).toBe("0 % damage");
    expect(root.querySelector('[data-field="force"]')?.textContent).toBe("12");
    expect(root.querySelector('[data-field="target"]')?.textContent).toBe("30");
    expect(root.querySelector('[data-field="win-chance"]')?.textContent).toBe(
      "70 %",
    );
    expect(
      root.querySelector<HTMLElement>('[data-field="win-chance"]')?.dataset
        .tone,
    ).toBe("ok");
  });

  it("reports checkbox changes with the unit id and reflects the selection", () => {
    const { view, onToggleSquad, onToggleMech } = build();
    const m = model();
    view.update(m);
    const box = root.querySelector<HTMLInputElement>(
      '#deploy-squads input[type="checkbox"]',
    );
    box!.checked = true;
    box!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onToggleSquad).toHaveBeenCalledWith(m.squads[0]?.id, true);
    const mechBox = root.querySelector<HTMLInputElement>(
      '#deploy-mechs input[type="checkbox"]',
    );
    mechBox!.checked = true;
    mechBox!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onToggleMech).toHaveBeenCalledWith(m.mechs[0]?.id, true);

    view.update(model({ selectedSquadIds: new Set([m.squads[0]!.id]) }));
    expect(
      root
        .querySelector("#deploy-squads tbody tr")
        ?.classList.contains("is-selected"),
    ).toBe(true);
    expect(box!.checked).toBe(true);
  });

  it("shows empty notes and dashes without units or an assessment", () => {
    const { view } = build();
    view.update(model({ squads: [], mechs: [], assessment: undefined }));
    expect(
      root.querySelector<HTMLElement>('[data-role="no-squads"]')?.hidden,
    ).toBe(false);
    expect(
      root.querySelector<HTMLElement>('[data-role="no-mechs"]')?.hidden,
    ).toBe(false);
    expect(root.querySelector('[data-field="win-chance"]')?.textContent).toBe(
      "—",
    );
  });

  it("reuses rows and drops units that left the roster", () => {
    const { view } = build();
    const m = model();
    view.update(m);
    const before = root.querySelector("#deploy-squads tbody tr");
    view.update(model({ squads: m.squads.slice(0, 1) }));
    expect(root.querySelectorAll("#deploy-squads tbody tr")).toHaveLength(1);
    expect(root.querySelector("#deploy-squads tbody tr")).toBe(before);
    view.unmount();
    expect(root.children).toHaveLength(0);
  });

  it("stops the player at the cap instead of at Launch (#487)", () => {
    const { view } = build();
    const squads = model().squads;
    expect(squads.length).toBeGreaterThan(1);
    const box = (id: string): HTMLInputElement | null =>
      root.querySelector<HTMLInputElement>(
        `tr[data-squad-id="${id}"] input[type="checkbox"]`,
      );

    // One short of the cap: everything is still pickable.
    view.update(
      model({
        maxUnits: 2,
        selectedSquadIds: new Set([squads[0]!.id]),
      }),
    );
    expect(box(squads[1]!.id)?.disabled).toBe(false);

    // At the cap: the unpicked are disabled and say why, while the
    // picked stay enabled so a player can swap one out rather than
    // having to start over.
    view.update(
      model({
        maxUnits: 2,
        selectedSquadIds: new Set([squads[0]!.id, squads[1]!.id]),
      }),
    );
    expect(box(squads[0]!.id)?.disabled).toBe(false);
    const rest = squads.find(
      (s) => s.id !== squads[0]!.id && s.id !== squads[1]!.id,
    );
    if (rest) {
      expect(box(rest.id)?.disabled).toBe(true);
      expect(box(rest.id)?.title).toContain("full");
    }
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import type { Nemesis } from "../../overworld/model/nemesis";
import type { GameState } from "../../save/model/game-state";
import { campaignOnDay } from "./mission-fixtures.test-helper";
import { NemesesView } from "./nemeses-view";

// ===========================================
// Fixtures
// ===========================================

const OLD_SCALD: Nemesis = {
  id: "nemesis-old-scald",
  speciesId: "broodmother",
  name: "Old Scald",
  scar: "burned along the flank",
  regionId: "east-asia",
  level: 2,
  escapes: 2,
};

/** A campaign whose record holds `nemeses`. */
function withNemeses(nemeses: readonly Nemesis[]): GameState {
  const state = campaignOnDay(12, []);
  return {
    ...state,
    overworld: {
      ...state.overworld,
      progress: { ...state.overworld.progress, nemeses },
    },
  };
}

// ===========================================
// Tests
// ===========================================

describe("NemesesView (campaign arc §8, #1179)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const section = (): HTMLElement | null =>
    root.querySelector<HTMLElement>('[data-role="nemeses"]');
  const items = (): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>("[data-nemesis-id]"),
  ];
  const text = (item: HTMLElement, field: string): string =>
    item.querySelector(`[data-field="${field}"]`)?.textContent ?? "";

  it("stays hidden while the campaign remembers nobody", () => {
    const view = new NemesesView();
    view.mount(root);
    expect(section()?.hidden).toBe(true);
    view.update(withNemeses([]));
    expect(section()?.hidden).toBe(true);
    view.update(undefined);
    expect(section()?.hidden).toBe(true);
  });

  it("shows each nemesis' crown, name, level, species, region and scar", () => {
    const view = new NemesesView();
    view.mount(root);
    view.update(withNemeses([OLD_SCALD]));
    expect(section()?.hidden).toBe(false);
    const [item] = items();
    expect(item?.dataset.nemesisId).toBe("nemesis-old-scald");
    expect(item?.querySelector('[data-icon="nemesis"]')).not.toBeNull();
    expect(text(item!, "nemesis-name")).toBe("Old Scald");
    expect(text(item!, "nemesis-level")).toBe("Level 2");
    expect(text(item!, "nemesis-where")).toBe("Broodmother · East Asia");
    expect(text(item!, "nemesis-scar")).toBe("burned along the flank");
  });

  it("rebuilds only when the record changes, and hides when she dies", () => {
    const view = new NemesesView();
    view.mount(root);
    view.update(withNemeses([OLD_SCALD]));
    const first = items()[0];
    view.update(withNemeses([OLD_SCALD]));
    expect(items()[0]).toBe(first);
    view.update(withNemeses([{ ...OLD_SCALD, level: 3 }]));
    expect(text(items()[0]!, "nemesis-level")).toBe("Level 3");
    view.update(withNemeses([]));
    expect(section()?.hidden).toBe(true);
    view.unmount();
    expect(section()).toBeNull();
  });
});

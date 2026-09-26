// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { SitrepTagsView } from "./sitrep-tags-view";

describe("SitrepTagsView", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const block = (): HTMLElement | null =>
    root.querySelector<HTMLElement>('[data-role="sitreps"]');
  const rows = (): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>("[data-sitrep]"),
  ];
  const text = (row: HTMLElement, field: string): string =>
    row.querySelector(`[data-field="${field}"]`)?.textContent ?? "";

  it("is hidden for an offer without sitreps", () => {
    const view = new SitrepTagsView();
    view.mount(root);
    expect(block()?.hidden).toBe(true);
    view.update({});
    expect(block()?.hidden).toBe(true);
    expect(rows()).toHaveLength(0);
  });

  it("shows one tag row per sitrep: name, marker and effect", () => {
    const view = new SitrepTagsView();
    view.mount(root);
    view.update({ sitreps: ["nightfall", "local-guides"] });
    expect(block()?.hidden).toBe(false);
    const [night, guides] = rows();
    expect(text(night!, "sitrep-name")).toBe("Nightfall");
    expect(text(night!, "sitrep-marker")).toBe("Hazard");
    expect(text(night!, "sitrep-effect")).toBe("Sight −4 for both sides.");
    expect(text(guides!, "sitrep-name")).toBe("Local Guides");
    expect(text(guides!, "sitrep-marker")).toBe("Helps you");
  });

  it("sets a helping sitrep apart by an existing colour token and by words", () => {
    const view = new SitrepTagsView();
    view.mount(root);
    view.update({ sitreps: ["spore-fog", "salvage-rich"] });
    const [fog, salvage] = rows();
    const badge = (row: HTMLElement) =>
      row.querySelector<HTMLElement>('[data-field="sitrep-name"]')!;
    expect(badge(salvage!).classList.contains("tut-badge--ok")).toBe(true);
    expect(badge(fog!).classList.contains("tut-badge--warn")).toBe(true);
    expect(salvage!.classList.contains("tut-sitrep--helps")).toBe(true);
    expect(salvage!.dataset.helps).toBe("true");
    expect(fog!.dataset.helps).toBe("false");
    expect(text(salvage!, "sitrep-marker")).not.toBe(
      text(fog!, "sitrep-marker"),
    );
  });

  it("rebuilds only when the sitreps change, and hides when the offer goes", () => {
    const view = new SitrepTagsView();
    view.mount(root);
    view.update({ sitreps: ["city-ablaze"] });
    const first = rows()[0];
    view.update({ sitreps: ["city-ablaze"] });
    expect(rows()[0]).toBe(first);
    view.update({ sitreps: ["nightfall"] });
    expect(rows().map((row) => row.dataset.sitrep)).toEqual(["nightfall"]);
    view.update(undefined);
    expect(block()?.hidden).toBe(true);
    view.unmount();
    expect(block()).toBeNull();
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { NemesisFatesView, NO_NEMESES } from "./nemesis-fates-view";

describe("NemesisFatesView", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("says each nemesis was killed on a day or is still out there, in order", () => {
    new NemesisFatesView().mount(root, [
      {
        id: "nemesis-1",
        name: "Old Scald",
        speciesId: "broodmother",
        killedDay: 212,
      },
      { id: "nemesis-2", name: "Grey Widow", speciesId: "broodmother" },
    ]);
    const fates = [...root.querySelectorAll<HTMLElement>(".tut-nemeses__fate")];
    expect(fates.map((fate) => fate.textContent)).toEqual([
      "Old Scald: killed on day 212",
      "Grey Widow: still out there",
    ]);
    expect(fates.map((fate) => fate.dataset.fate)).toEqual(["killed", "alive"]);
  });

  it("says none rose when the list is empty, and unmounts", () => {
    const view = new NemesisFatesView();
    view.mount(root, []);
    expect(root.textContent).toContain(NO_NEMESES);
    view.unmount();
    expect(root.querySelector('[data-role="nemeses"]')).toBeNull();
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { GraveyardView } from "./graveyard-view";

describe("GraveyardView", () => {
  it("shows the empty note before any loss and lists losses newest first", () => {
    const root = document.createElement("div");
    const view = new GraveyardView();
    view.mount(root);
    view.update([]);
    const empty = root.querySelector<HTMLElement>('[data-role="no-losses"]');
    expect(empty?.hidden).toBe(false);

    view.update([
      { kind: "squad", name: "Alpha", day: 2, missionId: "m1" },
      { kind: "mech", name: "Anvil", day: 4, missionId: "m2" },
    ]);
    expect(empty?.hidden).toBe(true);
    expect(
      [...root.querySelectorAll("li")].map((li) => li.dataset.kind),
    ).toEqual(["mech", "squad"]);
    view.unmount();
    expect(root.childElementCount).toBe(0);
  });
});

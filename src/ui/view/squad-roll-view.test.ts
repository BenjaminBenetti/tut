// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import type { SquadRollEntry } from "../../overworld/model/outcome-chronicle";
import { RANKS } from "../../roster/data/ranks";
import { EMPTY_ROLL, rollOrder, SquadRollView } from "./squad-roll-view";

const entry = (
  kind: SquadRollEntry["kind"],
  name: string,
  kills: number,
  xp = kills * 10,
): SquadRollEntry => ({
  kind,
  id: `${kind}-${name}`,
  name,
  kills,
  missionsSurvived: 3,
  xp,
});

describe("rollOrder", () => {
  it("puts mechs before squads, most kills first, a tie in roster order", () => {
    const order = rollOrder([
      entry("squad", "Bravo", 4),
      entry("mech", "Lantern", 19),
      entry("squad", "Alpha", 23),
      entry("mech", "Hammerhead", 64),
      entry("mech", "Anvil", 19),
    ]);
    expect(order.map((e) => e.name)).toEqual([
      "Hammerhead",
      "Lantern",
      "Anvil",
      "Alpha",
      "Bravo",
    ]);
  });
});

describe("SquadRollView", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("rolls each entry with its kind, rank and record", () => {
    new SquadRollView(RANKS).mount(root, [
      entry("squad", "Alpha", 23, 230),
      entry("mech", "Hammerhead", 64, 640),
    ]);
    const items = [...root.querySelectorAll<HTMLElement>(".tut-roll__entry")];
    expect(items.map((item) => item.dataset.kind)).toEqual(["mech", "squad"]);
    const field = (item: HTMLElement | undefined, name: string): string =>
      item?.querySelector<HTMLElement>(`[data-field="${name}"]`)?.textContent ??
      "";
    expect(field(items[0], "roll-name")).toBe("Hammerhead");
    expect(field(items[0], "roll-role")).toBe("Mech · Sergeant Major");
    expect(field(items[0], "roll-record")).toBe("64 kills · 3 missions");
    expect(field(items[1], "roll-role")).toBe("Squad · Master Sergeant");
  });

  it("names the kind alone without a ladder", () => {
    new SquadRollView().mount(root, [entry("mech", "Lantern", 1)]);
    expect(
      root.querySelector<HTMLElement>('[data-field="roll-role"]')?.textContent,
    ).toBe("Mech");
  });

  it("says so when nobody finished the campaign, and unmounts", () => {
    const view = new SquadRollView(RANKS);
    view.mount(root, []);
    expect(root.textContent).toContain(EMPTY_ROLL);
    view.unmount();
    expect(root.querySelector('[data-role="squad-roll"]')).toBeNull();
  });
});

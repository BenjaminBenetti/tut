// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { CONTINENTS } from "../../overworld/data/continents";
import type { GreatHive } from "../../overworld/model/great-hive";
import { GREAT_HIVES_REVEALED } from "../../overworld/model/great-hives-revealed-event";
import {
  GREAT_HIVE_REVEAL_TITLE,
  GreatHiveRevealView,
  joinNames,
} from "./great-hive-reveal-view";

// ===========================================
// Fixtures
// ===========================================

/** A Great Hive on `continentId`, seated in its first region. */
function greatHive(
  id: string,
  continentId: "europe" | "asia" | "oceania",
): GreatHive {
  const continent = CONTINENTS[continentId];
  return {
    id,
    continentId,
    name: continent.name,
    regionId: continent.regionIds[0] ?? "",
    regionIds: continent.regionIds,
    revealedDay: 212,
    level: 0,
  };
}

const HIVES: readonly GreatHive[] = [
  greatHive("greathive-1", "europe"),
  greatHive("greathive-2", "asia"),
  greatHive("greathive-3", "oceania"),
];

/** The reveal as the tick emits it. */
const REVEALED = {
  type: GREAT_HIVES_REVEALED,
  payload: { greatHives: HIVES },
};

// ===========================================
// The story beat
// ===========================================

describe("GreatHiveRevealView (#1179)", () => {
  let root: HTMLElement;
  let view: GreatHiveRevealView;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    view = new GreatHiveRevealView();
    view.mount(root);
  });

  const modal = (): HTMLElement => {
    const el = root.querySelector<HTMLElement>(
      '[data-role="great-hive-reveal"]',
    );
    if (!el) throw new Error("no reveal modal");
    return el;
  };

  it("mounts hidden as a dialog with the beat's headline", () => {
    expect(modal().hidden).toBe(true);
    expect(modal().querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      modal().querySelector('[data-field="great-hive-reveal-title"]')
        ?.textContent,
    ).toBe("Three Great Hives: the platform's beacons");
    expect(GREAT_HIVE_REVEAL_TITLE).toBe(
      "Three Great Hives: the platform's beacons",
    );
  });

  it("opens on the reveal and names the three continents", () => {
    view.notice([{ type: "overworld:day-advanced", payload: {} }, REVEALED]);

    expect(modal().hidden).toBe(false);
    expect(
      modal().querySelector('[data-field="great-hive-reveal-text"]')
        ?.textContent,
    ).toContain("the Great Hives under Europe, Asia and Oceania.");
    const rows = [
      ...modal().querySelectorAll<HTMLElement>("[data-great-hive-id]"),
    ];
    expect(rows.map((row) => row.dataset.greatHiveId)).toEqual([
      "greathive-1",
      "greathive-2",
      "greathive-3",
    ]);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Europe4 regions",
      "Asia4 regions",
      "Oceania1 region",
    ]);
    expect(modal().textContent).toContain("the launch window opens");
  });

  it("stays shut on other events and stays open until dismissed", () => {
    view.notice([]);
    view.notice([{ type: "overworld:day-advanced", payload: {} }]);
    expect(modal().hidden).toBe(true);

    view.notice([REVEALED]);
    view.notice([]);
    expect(modal().hidden).toBe(false);

    modal()
      .querySelector<HTMLButtonElement>(
        '[data-action="dismiss-great-hive-reveal"]',
      )
      ?.click();
    expect(modal().hidden).toBe(true);
  });

  it("leaves nothing behind on unmount", () => {
    view.unmount();
    expect(root.querySelector('[data-role="great-hive-reveal"]')).toBeNull();
    view.notice([REVEALED]);
    expect(root.childElementCount).toBe(0);
  });
});

describe("joinNames", () => {
  it("lists names as a sentence does", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Europe"])).toBe("Europe");
    expect(joinNames(["Europe", "Asia"])).toBe("Europe and Asia");
    expect(joinNames(["Europe", "Asia", "Oceania"])).toBe(
      "Europe, Asia and Oceania",
    );
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DefendGeneratorsObjective,
  DestroySpawnerObjective,
  Spawner,
} from "../../tactical/model/tactical-state";
import type {
  ObjectivePresentationCatalogue,
  ObjectiveRow,
} from "../model/objective-presentation";
import { OBJECTIVE_PRESENTATION } from "../service/objectives/objective-presentation";
import { ObjectiveTrackerView } from "./objective-tracker-view";

// ===========================================
// Fixtures
// ===========================================

const NEST: DestroySpawnerObjective = {
  id: "objective-a",
  kind: "destroy-spawner",
  targetId: "spawner-a",
  complete: false,
};

const HOLD: DefendGeneratorsObjective = {
  id: "objective-b",
  kind: "defend-generators",
  installation: "bank",
  targetIds: ["gen-1"],
  complete: true,
  failed: false,
};

const SPAWNERS: readonly Spawner[] = [
  {
    id: "spawner-a",
    pos: { x: 0, y: 0, z: 0 },
    hatchRadius: 3,
    hp: 20,
    timer: 2,
    destroyed: false,
  },
];

/** A row no shipped kind would ever draw, so nothing else can produce it. */
const PROBE_ROW: ObjectiveRow = {
  icon: "radar",
  label: "Probe the nest",
  data: { probe: "on" },
  layout: "inline",
  detail: { text: "7 pings", role: "probe-detail" },
};

/** A stacked row, to show the tracker honours the kind's layout. */
const STACKED_ROW: ObjectiveRow = {
  icon: "lock",
  label: "Hold the probe",
  data: { held: "yes" },
  layout: "stacked",
  detail: { text: "3 / 4 up" },
};

// ===========================================
// ObjectiveTrackerView and the table
// ===========================================

describe("ObjectiveTrackerView draws rows from OBJECTIVE_PRESENTATION (ADR 0013 §2.3)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const rowOf = (id: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-objective-id="${id}"]`);

  it("draws what each kind's presentation describes, with the ordinal and that objective's reading", () => {
    const nestRow = vi.fn(() => PROBE_ROW);
    const holdRow = vi.fn(() => STACKED_ROW);
    const presentations: ObjectivePresentationCatalogue = {
      "destroy-spawner": {
        ...OBJECTIVE_PRESENTATION["destroy-spawner"],
        row: nestRow,
      },
      "defend-generators": {
        ...OBJECTIVE_PRESENTATION["defend-generators"],
        row: holdRow,
      },
    };
    const view = new ObjectiveTrackerView(presentations);
    view.mount(root);
    const reading = { any: "shape the kind likes" };
    view.update(
      [NEST, HOLD],
      SPAWNERS,
      undefined,
      new Map([[HOLD.id, reading]]),
    );

    expect(nestRow).toHaveBeenCalledWith(NEST, {
      ordinal: 1,
      spawners: SPAWNERS,
      progress: undefined,
    });
    expect(holdRow).toHaveBeenCalledWith(HOLD, {
      ordinal: 2,
      spawners: SPAWNERS,
      progress: reading,
    });

    const nest = rowOf(NEST.id);
    expect(nest?.dataset.complete).toBe("false");
    expect(nest?.dataset.probe).toBe("on");
    expect(nest?.textContent).toBe("Probe the nest7 pings");
    expect(
      nest?.querySelector<HTMLElement>('[data-icon="radar"]'),
    ).not.toBeNull();
    const pings = nest?.querySelector<HTMLElement>(
      '[data-role="probe-detail"]',
    );
    expect(pings?.parentElement).toBe(nest);
    expect(pings?.className).toBe("tut-mono tut-dim");

    const hold = rowOf(HOLD.id);
    expect(hold?.dataset.complete).toBe("true");
    expect(hold?.dataset.held).toBe("yes");
    expect(hold?.querySelector('[data-icon="lock"]')).not.toBeNull();
    const stack = hold?.querySelector<HTMLElement>(".tut-hud__defence");
    expect(stack?.parentElement).toBe(hold);
    expect([...(stack?.children ?? [])].map((c) => c.textContent)).toEqual([
      "Hold the probe",
      "3 / 4 up",
    ]);

    // The summary stays the tracker's: it counts records, not rows.
    expect(
      root.querySelector('[data-field="objective-summary"]')?.textContent,
    ).toBe("1 / 2");
  });

  it("marks the objective in reach whatever its kind draws", () => {
    const presentations: ObjectivePresentationCatalogue = {
      ...OBJECTIVE_PRESENTATION,
      "defend-generators": {
        ...OBJECTIVE_PRESENTATION["defend-generators"],
        row: () => STACKED_ROW,
      },
    };
    const view = new ObjectiveTrackerView(presentations);
    view.mount(root);
    view.update([NEST, HOLD], SPAWNERS, HOLD.id);
    const hold = rowOf(HOLD.id);
    expect(hold?.dataset.inReach).toBe("true");
    expect(hold?.lastElementChild?.getAttribute("data-role")).toBe("in-reach");
    expect(rowOf(NEST.id)?.dataset.inReach).toBeUndefined();
  });

  it("uses the shipped table when none is given", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([NEST, HOLD], SPAWNERS);
    expect(rowOf(NEST.id)?.textContent).toBe("Destroy spawner 120 hp");
    expect(rowOf(HOLD.id)?.textContent).toBe("Held the bank");
  });
});

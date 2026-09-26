// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DefendGeneratorsObjective,
  DestroyPodObjective,
  DestroySpawnerObjective,
  SealTunnelsObjective,
  Spawner,
  StripWreckObjective,
  TacticalState,
} from "../../tactical/model/tactical-state";
import { objectiveCountdowns } from "../service/objectives/deadline-countdown";
import type {
  ObjectivePresentationCatalogue,
  ObjectiveRow,
} from "../model/objective-presentation";
import {
  OBJECTIVE_PRESENTATION,
  objectiveProgress,
} from "../service/objectives/objective-presentation";
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
      "destroy-pod": OBJECTIVE_PRESENTATION["destroy-pod"],
      "capture-specimen": OBJECTIVE_PRESENTATION["capture-specimen"],
      "rescue-civilians": OBJECTIVE_PRESENTATION["rescue-civilians"],
      "strip-wreck": OBJECTIVE_PRESENTATION["strip-wreck"],
      "destroy-hive-core": OBJECTIVE_PRESENTATION["destroy-hive-core"],
      "seal-tunnels": OBJECTIVE_PRESENTATION["seal-tunnels"],
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

    // Rows that say nothing of completion leave the count to the records.
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

  // A wreck's parts are home when a worker boards (arc §6.6), and the
  // Extract handler never writes that on the objective: the summary
  // read "0 / 1" above a row reading "Recovered the wreck's parts".
  it("counts a wreck whose parts are home, as its row reads it, though the flag never moved", () => {
    const strip: StripWreckObjective = {
      id: "objective-w",
      kind: "strip-wreck",
      targetId: "wreck-1",
      turnsNeeded: 2,
      turnsWorked: 2,
      lastWorkedTurn: 2,
      workedBy: ["squad-1"],
      complete: false,
    };
    const aboard = {
      objectives: [strip],
      units: [],
      extracted: [{ id: "squad-1", team: "tdf", kind: "squad", hp: 10 }],
      wrecks: [],
      turn: 3,
    } as unknown as TacticalState;
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([strip], [], undefined, objectiveProgress(aboard));

    expect(rowOf(strip.id)?.textContent).toBe("Recovered the wreck's parts");
    expect(rowOf(strip.id)?.dataset.complete).toBe("true");
    expect(
      root.querySelector('[data-field="objective-summary"]')?.textContent,
    ).toBe("1 / 1 — board the drop ship");
  });

  // Rendered on #1179: "0 / 2 turns" and "in reach" both beside the
  // label left it narrower than "Strip", so the turns were drawn over
  // it and "the" and "wreck" took a line each.
  it("puts a wreck's turns under its label, so the in-reach mark beside them leaves the label its width", () => {
    const strip: StripWreckObjective = {
      id: "objective-w",
      kind: "strip-wreck",
      targetId: "wreck-1",
      turnsNeeded: 2,
      turnsWorked: 0,
      workedBy: [],
      complete: false,
    };
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([strip], [], strip.id);

    const row = rowOf(strip.id);
    const stack = row?.querySelector<HTMLElement>(".tut-hud__defence");
    expect(stack?.parentElement).toBe(row);
    expect([...(stack?.children ?? [])].map((c) => c.textContent)).toEqual([
      "Strip the wreck",
      "0 / 2 turns",
    ]);
    expect(
      row?.querySelector('[data-role="strip-progress"]')?.parentElement,
    ).toBe(stack);
    const reach = row?.lastElementChild;
    expect(reach?.getAttribute("data-role")).toBe("in-reach");
    expect(reach?.parentElement).toBe(row);
  });
});

// ===========================================
// Deadlines
// ===========================================

describe("ObjectiveTrackerView counts a deadline down (ADR 0013 §2.3)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const POD: DestroyPodObjective = {
    id: "objective-p",
    kind: "destroy-pod",
    targetId: "spawner-p",
    complete: false,
    deadlineTurn: 8,
  };
  const POD_SPAWNER: Spawner = {
    id: "spawner-p",
    variant: "spore-pod",
    pos: { x: 5, y: 0, z: 5 },
    hatchRadius: 3,
    hp: 40,
    timer: 0,
    destroyed: false,
  };

  /** The tracker drawn for the pod and a nest on `turn`, as the HUD draws it. */
  function drawnOn(turn: number, pod: DestroyPodObjective = POD): HTMLElement {
    const objectives = [NEST, pod];
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update(
      objectives,
      [...SPAWNERS, POD_SPAWNER],
      undefined,
      undefined,
      objectiveCountdowns({ turn, objectives } as unknown as TacticalState),
    );
    return root;
  }

  const deadlineOf = (id: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(
      `[data-objective-id="${id}"] [data-role="deadline"]`,
    );

  it("puts the countdown under the pod's label, and none on a nest without a clock", () => {
    drawnOn(6);
    const line = deadlineOf(POD.id);
    expect(line?.textContent).toBe("Pod matures in 3 turns");
    expect(line?.dataset.urgent).toBe("false");
    // Under the label, in the stacked column; the hit points stay beside it.
    expect(line?.parentElement?.className).toBe("tut-hud__defence");
    expect(line?.previousElementSibling?.textContent).toBe(
      "Destroy the spore pod",
    );
    expect(
      root.querySelector(`[data-objective-id="${POD.id}"]`)?.textContent,
    ).toBe("Destroy the spore podPod matures in 3 turns40 hp");
    expect(deadlineOf(NEST.id)).toBeNull();
  });

  it("marks the last two turns urgent", () => {
    drawnOn(7);
    expect(deadlineOf(POD.id)?.dataset.urgent).toBe("true");
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    drawnOn(8);
    expect(deadlineOf(POD.id)?.textContent).toBe(
      "Pod matures at the end of this turn",
    );
    expect(deadlineOf(POD.id)?.dataset.urgent).toBe("true");
  });

  it("drops the countdown once the pod is wrecked or has matured", () => {
    drawnOn(6, { ...POD, complete: true });
    expect(deadlineOf(POD.id)).toBeNull();
    root.replaceChildren();
    drawnOn(9, { ...POD, failed: true });
    expect(deadlineOf(POD.id)).toBeNull();
  });
});

// ===========================================
// Optional objectives
// ===========================================

describe("ObjectiveTrackerView with optional objectives (#1179)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const rowOf = (id: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-objective-id="${id}"]`);
  const summary = (): HTMLElement | null =>
    root.querySelector<HTMLElement>('[data-field="objective-summary"]');

  const OPTIONAL_NEST: DestroySpawnerObjective = {
    ...NEST,
    complete: true,
    optional: true,
  };

  it("draws an optional objective's row, marked and tagged, but counts only the deciding ones", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    const open: DefendGeneratorsObjective = { ...HOLD, complete: false };
    view.update([OPTIONAL_NEST, open], SPAWNERS);
    expect(summary()?.textContent).toBe("0 / 1");
    expect(summary()?.dataset.complete).toBe("false");
    const nest = rowOf(OPTIONAL_NEST.id);
    expect(nest?.dataset.optional).toBe("true");
    expect(nest?.querySelector('[data-role="optional"]')?.textContent).toBe(
      "optional",
    );
    expect(rowOf(open.id)?.dataset.optional).toBeUndefined();
    expect(rowOf(open.id)?.querySelector('[data-role="optional"]')).toBeNull();
  });

  it("names the drop ship once every deciding objective is done, whatever the optional ones say", () => {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([{ ...OPTIONAL_NEST, complete: false }, HOLD], SPAWNERS);
    expect(summary()?.textContent).toBe("1 / 1 — board the drop ship");
    expect(summary()?.dataset.complete).toBe("true");
  });
});

// ===========================================
// A row's own countdowns
// ===========================================

describe("ObjectiveTrackerView draws a row's own countdowns (arc §6.7)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  const SEAL: SealTunnelsObjective = {
    id: "objective-t",
    kind: "seal-tunnels",
    mouthIds: ["tunnel-1", "tunnel-2", "tunnel-3"],
    complete: false,
  };

  /** A mouth whose charge tile is (x, 0), charged or sealed as given. */
  const mouth = (id: string, x: number, sealedOnTurn?: number) => ({
    id,
    pos: { x, y: 0, z: 0 },
    tiles: [{ x, y: 0, z: 0 }],
    chargeId: `${id}-charge`,
    ...(sealedOnTurn === undefined ? {} : { sealedOnTurn }),
  });

  /** A charge on `mouthId`, blowing as `detonatesOnTurn` opens. */
  const charge = (mouthId: string, x: number, detonatesOnTurn: number) => ({
    id: `${mouthId}-charge`,
    ownerId: "squad-1",
    equipmentId: "breaching-charge",
    tile: { x, y: 0, z: 0 },
    detonatesOnTurn,
  });

  it("puts a fuse line per burning charge under the label, the count beside it", () => {
    const mission = {
      turn: 5,
      objectives: [SEAL],
      tunnelMouths: [
        mouth("tunnel-1", 0, 4),
        mouth("tunnel-2", 12),
        mouth("tunnel-3", 24),
      ],
      charges: [charge("tunnel-2", 12, 6), charge("tunnel-3", 24, 8)],
    } as unknown as TacticalState;
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([SEAL], [], undefined, objectiveProgress(mission));

    const row = root.querySelector<HTMLElement>(
      `[data-objective-id="${SEAL.id}"]`,
    );
    const fuses = [
      ...(row?.querySelectorAll<HTMLElement>('[data-role="fuse"]') ?? []),
    ];
    expect(fuses.map((line) => line.textContent)).toEqual([
      "Tunnel 2 blows at the end of this turn",
      "Tunnel 3 blows in 3 turns",
    ]);
    expect(fuses.map((line) => line.dataset.urgent)).toEqual(["true", "false"]);
    // Under the label in the stacked column; the count stays beside it.
    expect(fuses[0]?.parentElement?.className).toBe("tut-hud__defence");
    expect(fuses[0]?.previousElementSibling?.textContent).toBe(
      "Tunnels sealed",
    );
    expect(
      row?.querySelector('[data-role="tunnels-sealed"]')?.textContent,
    ).toBe("1 / 3");
    expect(row?.querySelector('[data-role="deadline"]')).toBeNull();
  });

  it("sets a row's countdowns after its deadline, one line each, in a stacked row too", () => {
    const TIMED_ROW: ObjectiveRow = {
      ...STACKED_ROW,
      countdowns: [
        {
          text: "Probe blinks in 2 turns",
          turnsLeft: 2,
          urgent: true,
          role: "probe",
        },
      ],
    };
    const presentations: ObjectivePresentationCatalogue = {
      ...OBJECTIVE_PRESENTATION,
      "destroy-pod": {
        ...OBJECTIVE_PRESENTATION["destroy-pod"],
        row: () => TIMED_ROW,
      },
    };
    const pod: DestroyPodObjective = {
      id: "objective-p",
      kind: "destroy-pod",
      targetId: "spawner-p",
      complete: false,
      deadlineTurn: 8,
    };
    const view = new ObjectiveTrackerView(presentations);
    view.mount(root);
    view.update(
      [pod],
      [],
      undefined,
      undefined,
      objectiveCountdowns({
        turn: 6,
        objectives: [pod],
      } as unknown as TacticalState),
    );
    const stack = root.querySelector(".tut-hud__defence");
    expect(
      [...(stack?.children ?? [])].map(
        (child) => (child as HTMLElement).dataset.role ?? child.textContent,
      ),
    ).toEqual(["Hold the probe", "3 / 4 up", "deadline", "probe"]);
  });
});

// ===========================================
// Sitrep deadlines
// ===========================================

describe("ObjectiveTrackerView counts a sitrep's deadline down (campaign arc §11)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  /** The tracker with one nest and Dust-off Window's countdown. */
  function drawn(urgent: boolean): HTMLElement {
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([NEST], SPAWNERS, undefined, undefined, undefined, [
      {
        sitrepId: "dust-off-window",
        name: "Dust-off Window",
        text: urgent
          ? "Drop ship leaves at the end of this turn"
          : "Drop ship leaves in 5 turns",
        turnsLeft: urgent ? 1 : 5,
        urgent,
      },
    ]);
    return root;
  }

  it("draws a row of its own after the objectives, the name over the countdown, not counted", () => {
    drawn(false);
    const rows = [
      ...root.querySelectorAll<HTMLElement>(
        '[data-role="objective-list"] > li',
      ),
    ];
    expect(rows).toHaveLength(2);
    const hazard = rows[1]!;
    expect(hazard.dataset.sitrepId).toBe("dust-off-window");
    expect(hazard.dataset.objectiveId).toBeUndefined();
    expect(hazard.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
      "warning",
    );
    const line = hazard.querySelector<HTMLElement>('[data-role="deadline"]');
    expect(line?.textContent).toBe("Drop ship leaves in 5 turns");
    expect(line?.dataset.urgent).toBe("false");
    expect(line?.previousElementSibling?.textContent).toBe("Dust-off Window");
    expect(
      root.querySelector('[data-field="objective-summary"]')?.textContent,
    ).toBe("0 / 1");
  });

  it("pulses in its last turns, and draws nothing without one", () => {
    drawn(true);
    expect(
      root.querySelector<HTMLElement>('[data-sitrep-id] [data-role="deadline"]')
        ?.dataset.urgent,
    ).toBe("true");
    root.replaceChildren();
    const view = new ObjectiveTrackerView();
    view.mount(root);
    view.update([NEST], SPAWNERS);
    expect(root.querySelector("[data-sitrep-id]")).toBeNull();
  });
});

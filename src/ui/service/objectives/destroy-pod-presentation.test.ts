import { describe, expect, it } from "vitest";

import type {
  DestroyPodObjective,
  Spawner,
} from "../../../tactical/model/tactical-state";
import { ICON_MANIFEST } from "../../data/icon-manifest";
import { DESTROY_POD_PRESENTATION } from "./destroy-pod-presentation";

// ===========================================
// Fixtures
// ===========================================

const POD: Spawner = {
  id: "spawner-1",
  variant: "spore-pod",
  pos: { x: 5, y: 0, z: 5 },
  hatchRadius: 3,
  hp: 40,
  timer: 0,
  destroyed: false,
};

const OBJECTIVE: DestroyPodObjective = {
  id: "objective-1",
  kind: "destroy-pod",
  targetId: POD.id,
  complete: false,
  deadlineTurn: 8,
};

/** The row for the objective with the pod as given. */
function rowFor(objective: DestroyPodObjective, pod: Spawner) {
  return DESTROY_POD_PRESENTATION.row(objective, {
    ordinal: 1,
    spawners: [pod],
    progress: undefined,
  });
}

// ===========================================
// Tests
// ===========================================

describe("DESTROY_POD_PRESENTATION", () => {
  it("calls the pod the spore pod, and its deadline maturing", () => {
    expect(DESTROY_POD_PRESENTATION.name(OBJECTIVE, 3)).toBe("the spore pod");
    expect(DESTROY_POD_PRESENTATION.deadlinePhrase?.(OBJECTIVE)).toBe(
      "Pod matures",
    );
    expect(DESTROY_POD_PRESENTATION.trackedId?.(OBJECTIVE)).toBe(POD.id);
  });

  it("shows a ripening pod's hit points, a wrecked one as done and a matured one as lost", () => {
    expect(rowFor(OBJECTIVE, POD)).toEqual({
      icon: "egg",
      label: "Destroy the spore pod",
      data: { targetId: POD.id },
      layout: "inline",
      detail: { text: "40 hp" },
    });
    expect(
      rowFor(
        { ...OBJECTIVE, complete: true },
        { ...POD, hp: 0, destroyed: true },
      ),
    ).toEqual({
      icon: "check",
      label: "Destroyed the spore pod",
      data: { targetId: POD.id },
      layout: "inline",
    });
    expect(
      rowFor(
        { ...OBJECTIVE, failed: true },
        { ...POD, hp: 0, destroyed: true, matured: true },
      ),
    ).toEqual({
      icon: "warning",
      label: "Too late: the spore pod matured",
      data: { targetId: POD.id },
      layout: "inline",
    });
  });

  it("calls a great pod's target the pod's core, which ripens (#1238)", () => {
    const core: Spawner = {
      ...POD,
      variant: "great-pod-core",
      hp: 80,
      maxHp: 80,
    };
    const objective: DestroyPodObjective = {
      ...OBJECTIVE,
      targetId: core.id,
      deadlineTurn: 12,
      greatPod: true,
    };
    expect(DESTROY_POD_PRESENTATION.name(objective, 1)).toBe("the pod's core");
    expect(DESTROY_POD_PRESENTATION.deadlinePhrase?.(objective)).toBe(
      "Core ripens",
    );
    expect(rowFor(objective, core)).toEqual({
      icon: "egg",
      label: "Destroy the pod's core",
      data: { targetId: core.id },
      layout: "inline",
      detail: { text: "80 hp" },
    });
    expect(
      rowFor(
        { ...objective, complete: true },
        { ...core, hp: 0, destroyed: true },
      ).label,
    ).toBe("Destroyed the pod's core");
    expect(
      rowFor(
        { ...objective, failed: true },
        { ...core, hp: 0, destroyed: true, matured: true },
      ).label,
    ).toBe("Too late: the pod's core ripened");
  });

  it("uses glyphs the manifest has", () => {
    for (const icon of ["egg", "check", "warning"]) {
      expect(Object.keys(ICON_MANIFEST)).toContain(icon);
    }
  });
});

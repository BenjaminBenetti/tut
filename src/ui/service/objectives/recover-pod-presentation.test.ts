import { describe, expect, it } from "vitest";

import type { RecoverPodObjective } from "../../../tactical/model/tactical-state";
import {
  missionWith,
  openField,
  unitAt,
} from "../../../tactical/service/tactical-fixtures.test-helper";
import { ICON_MANIFEST } from "../../data/icon-manifest";
import type { PodReading } from "./recover-pod-presentation";
import { RECOVER_POD_PRESENTATION } from "./recover-pod-presentation";
import { deadlineCountdown } from "./deadline-countdown";

// ===========================================
// Fixtures
// ===========================================

const OBJECTIVE: RecoverPodObjective = {
  id: "objective-1",
  kind: "recover-pod",
  targetId: "unit-7",
  complete: false,
  failed: false,
  deadlineTurn: 8,
  huntedAt: { x: 5, y: 0, z: 5 },
};

/** The row for `objective` with the pod reading as given. */
function rowFor(
  objective: RecoverPodObjective,
  progress: PodReading | undefined,
) {
  return RECOVER_POD_PRESENTATION.row(objective, {
    ordinal: 1,
    spawners: [],
    progress,
  });
}

// ===========================================
// Tests
// ===========================================

describe("RECOVER_POD_PRESENTATION (#1179)", () => {
  it("calls the pod the spore pod, tracks its unit, and counts down to the recovery", () => {
    expect(RECOVER_POD_PRESENTATION.name(OBJECTIVE, 1)).toBe("the spore pod");
    expect(RECOVER_POD_PRESENTATION.trackedId?.(OBJECTIVE)).toBe("unit-7");
    const phrase = RECOVER_POD_PRESENTATION.deadlinePhrase?.(OBJECTIVE) ?? "";
    expect(phrase).toBe("Recovery");
    expect(deadlineCountdown(OBJECTIVE, 6, phrase)?.text).toBe(
      "Recovery in 3 turns",
    );
    expect(deadlineCountdown(OBJECTIVE, 8, phrase)?.text).toBe(
      "Recovery at the end of this turn",
    );
  });

  it("reads the pod's hit points off its unit, and nothing once it is lifted", () => {
    const pod = {
      ...unitAt("unit-7", "infantry", { x: 5, y: 0, z: 5 }, { hp: -4 }),
      kind: "generator" as const,
      maxHp: 65,
    };
    const standing = missionWith(openField().build(), [{ ...pod, hp: 48 }]);
    expect(RECOVER_POD_PRESENTATION.progress?.(OBJECTIVE, standing)).toEqual({
      hp: 48,
      maxHp: 65,
    });
    const overkilled = missionWith(openField().build(), [pod]);
    expect(RECOVER_POD_PRESENTATION.progress?.(OBJECTIVE, overkilled)).toEqual({
      hp: 0,
      maxHp: 65,
    });
    const lifted = missionWith(openField().build(), []);
    expect(
      RECOVER_POD_PRESENTATION.progress?.(OBJECTIVE, lifted),
    ).toBeUndefined();
  });

  it("shows the pod's hit points while it must be kept alive", () => {
    expect(rowFor(OBJECTIVE, { hp: 48, maxHp: 65 })).toEqual({
      icon: "pod",
      label: "Keep the spore pod alive",
      data: { targetId: "unit-7", status: "open" },
      layout: "stacked",
      detail: { text: "48 / 65 hp", role: "pod-hp" },
    });
  });

  it("shows a lifted pod as done, and a destroyed one as lost at once", () => {
    expect(
      rowFor({ ...OBJECTIVE, complete: true, recoveredHp: 40 }, undefined),
    ).toEqual({
      icon: "check",
      label: "Recovered the spore pod",
      data: { targetId: "unit-7", status: "recovered" },
      layout: "stacked",
    });
    const lost = {
      icon: "warning",
      label: "Lost the spore pod",
      data: { targetId: "unit-7", status: "lost" },
      layout: "stacked",
    };
    expect(
      rowFor({ ...OBJECTIVE, failed: true }, { hp: 0, maxHp: 65 }),
    ).toEqual(lost);
    // Down to nothing before the phase step records it.
    expect(rowFor(OBJECTIVE, { hp: 0, maxHp: 65 })).toEqual(lost);
  });

  it("uses glyphs the icon manifest has", () => {
    for (const icon of ["pod", "check", "warning"] as const) {
      expect(ICON_MANIFEST[icon]).toBeDefined();
    }
  });
});

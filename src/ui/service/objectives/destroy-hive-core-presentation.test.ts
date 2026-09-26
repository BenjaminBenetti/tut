import { describe, expect, it } from "vitest";

import type {
  DestroyHiveCoreObjective,
  Spawner,
} from "../../../tactical/model/tactical-state";
import { ICON_MANIFEST } from "../../data/icon-manifest";
import { DESTROY_HIVE_CORE_PRESENTATION } from "./destroy-hive-core-presentation";
import { OBJECTIVE_PRESENTATION } from "./objective-presentation";

// ===========================================
// Fixtures
// ===========================================

const CORE: Spawner = {
  id: "spawner-1",
  variant: "hive-core",
  pos: { x: 5, y: 0, z: 5 },
  hatchRadius: 3,
  hp: 60,
  maxHp: 90,
  timer: 0,
  destroyed: false,
};

const OBJECTIVE: DestroyHiveCoreObjective = {
  id: "objective-1",
  kind: "destroy-hive-core",
  targetId: CORE.id,
  complete: false,
};

/** The row for the objective with the core as given. */
function rowFor(objective: DestroyHiveCoreObjective, core: Spawner) {
  return DESTROY_HIVE_CORE_PRESENTATION.row(objective, {
    ordinal: 1,
    spawners: [core],
    progress: undefined,
  });
}

// ===========================================
// Tests
// ===========================================

describe("DESTROY_HIVE_CORE_PRESENTATION", () => {
  it("is the table's entry for the kind", () => {
    expect(OBJECTIVE_PRESENTATION["destroy-hive-core"]).toBe(
      DESTROY_HIVE_CORE_PRESENTATION,
    );
  });

  it("calls the core the hive core, and tracks it by the core's id", () => {
    expect(DESTROY_HIVE_CORE_PRESENTATION.name(OBJECTIVE, 3)).toBe(
      "the hive core",
    );
    expect(DESTROY_HIVE_CORE_PRESENTATION.trackedId?.(OBJECTIVE)).toBe(CORE.id);
  });

  it("shows a standing core's hit points against its full health", () => {
    expect(rowFor(OBJECTIVE, CORE)).toEqual({
      icon: "marker-hive",
      label: "Destroy the hive core",
      data: { targetId: CORE.id },
      layout: "inline",
      detail: { text: "60 / 90 hp", role: "hive-core-hp" },
    });
  });

  it("shows a fallen core as done and a failed assault as lost", () => {
    const fallen = { ...CORE, hp: 0, destroyed: true };

    expect(rowFor({ ...OBJECTIVE, complete: true }, fallen)).toEqual({
      icon: "check",
      label: "Destroyed the hive core",
      data: { targetId: CORE.id },
      layout: "inline",
    });
    expect(rowFor({ ...OBJECTIVE, failed: true }, CORE)).toMatchObject({
      icon: "warning",
      label: "The assault failed: the hive stands",
    });
  });

  it("uses only registered glyphs", () => {
    for (const objective of [
      OBJECTIVE,
      { ...OBJECTIVE, complete: true },
      { ...OBJECTIVE, failed: true },
    ]) {
      expect(Object.keys(ICON_MANIFEST)).toContain(
        rowFor(objective, CORE).icon,
      );
    }
  });
});

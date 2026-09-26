import { describe, expect, it } from "vitest";

import type {
  DestroyPlatformCoreObjective,
  Spawner,
} from "../../../tactical/model/tactical-state";
import { DESTROY_PLATFORM_CORE_PRESENTATION } from "./destroy-platform-core-presentation";

// ===========================================
// Fixtures
// ===========================================

const CORE: Spawner = {
  id: "spawner-1",
  variant: "platform-core",
  pos: { x: 5, y: 0, z: 5 },
  hatchRadius: 0,
  hp: 140,
  timer: 0,
  destroyed: false,
};

const OBJECTIVE: DestroyPlatformCoreObjective = {
  id: "objective-1",
  kind: "destroy-platform-core",
  targetId: CORE.id,
  coreHp: 200,
  complete: false,
};

/** The row for `objective` with the core as given. */
function rowFor(objective: DestroyPlatformCoreObjective, core: Spawner) {
  return DESTROY_PLATFORM_CORE_PRESENTATION.row(objective, {
    ordinal: 1,
    spawners: [core],
    progress: undefined,
  });
}

// ===========================================
// Tests
// ===========================================

describe("DESTROY_PLATFORM_CORE_PRESENTATION (#1179)", () => {
  it("names the platform core and tracks it", () => {
    expect(DESTROY_PLATFORM_CORE_PRESENTATION.name(OBJECTIVE, 1)).toBe(
      "the platform core",
    );
    expect(DESTROY_PLATFORM_CORE_PRESENTATION.trackedId?.(OBJECTIVE)).toBe(
      CORE.id,
    );
  });

  it("puts a standing core's hit points against its whole under the label, not beside it", () => {
    expect(rowFor(OBJECTIVE, CORE)).toEqual({
      icon: "pod",
      label: "Destroy the platform core",
      data: { targetId: CORE.id },
      layout: "stacked",
      detail: { text: "140 / 200 hp", role: "platform-core-hp" },
    });
  });

  it("reads done, with no count, once the core is destroyed", () => {
    expect(
      rowFor(
        { ...OBJECTIVE, complete: true },
        { ...CORE, hp: 0, destroyed: true },
      ),
    ).toEqual({
      icon: "check",
      label: "Destroyed the platform core",
      data: { targetId: CORE.id },
      layout: "inline",
    });
  });
});

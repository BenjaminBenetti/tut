import { describe, expect, it } from "vitest";

import type { Rect, Vec3 } from "../../core/model/grid";
import type { UnitTemplateLookup } from "../../graphics/service/tactical-scene-builder";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { SideVision, Spawner } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { UNIT_SPOTTED } from "../../tactical/model/unit-spotted-event";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import {
  missionWith,
  openField,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { withVision } from "../../tactical/service/vision-service";
import {
  drawPerceived,
  frameMission,
  playAroundRedraw,
} from "./tactical-scene-steps";

// ===========================================
// Recorders
// ===========================================

/** A `PerceivedStage` that records every call in order. */
class StageRecorder {
  readonly calls: string[] = [];
  vision: SideVision | undefined;
  units: readonly Unit[] = [];
  spawners: readonly Spawner[] = [];

  /** Records the vision handed to the scene. */
  setVision(vision: SideVision | undefined): void {
    this.calls.push("setVision");
    this.vision = vision;
  }

  /** Records the units the scene was asked to draw. */
  update(
    units: readonly Unit[],
    _templates: UnitTemplateLookup,
  ): Promise<void> {
    this.calls.push("update");
    this.units = units;
    return Promise.resolve();
  }

  /** Records the spawners the scene was asked to draw. */
  updateSpawners(spawners: readonly Spawner[]): Promise<void> {
    this.calls.push("updateSpawners");
    this.spawners = spawners;
    return Promise.resolve();
  }
}

/** A `SceneFraming` that records where it was aimed. */
class FramingRecorder {
  bounds: Rect | undefined;
  target: Vec3 | undefined;

  /** Records the pan bounds. */
  setBounds(bounds: Rect | undefined): void {
    this.bounds = bounds;
  }

  /** Records the point the camera was centred on. */
  lookAt(target: Vec3): void {
    this.target = target;
  }
}

/** A `PhasedQueue` that plays synchronously and records each batch. */
class QueueRecorder {
  readonly batches: TacticalEvent[][] = [];
  readonly calls: string[] = [];

  /** Records the batch, then runs the continuation at once. */
  enqueue(events: readonly TacticalEvent[], done: () => void): void {
    this.batches.push([...events]);
    this.calls.push(`enqueue(${events.map((e) => e.type).join(",") || "-"})`);
    done();
  }
}

// ===========================================
// Fixtures
// ===========================================

const MAP = openField().build();

/** A mission with one TDF unit and one bug, and vision computed for real. */
function missionWithBug() {
  const base = missionWith(MAP, [
    unitAt("s1", "infantry", { x: 0, y: 0, z: 0 }),
    unitAt("far", "infantry", { x: 7, y: 0, z: 7 }, { team: "bugs" }),
  ]);
  return withVision({ state: base, events: [] }).state;
}

// ===========================================
// drawPerceived
// ===========================================

describe("drawPerceived", () => {
  it("draws the side's view, not the mission (#551)", () => {
    const mission = missionWithBug();
    const stage = new StageRecorder();
    // The bug is out of sight across an 8x8 field, so the player is not
    // entitled to see it.
    expect(mission.vision.tdf.spotted).not.toContain("far");

    return drawPerceived(stage, mission).then(() => {
      // Passing `mission.units` here would put a model on the board for
      // an enemy nobody has seen, which can then be picked and read off
      // the scene graph — a wallhack, not a cosmetic slip.
      expect(stage.units.map((u) => u.id)).toEqual(["s1"]);
      expect(stage.units.map((u) => u.id)).not.toContain("far");
    });
  });

  it("sets the vision before it places anything on it (#551)", async () => {
    const stage = new StageRecorder();
    const mission = missionWithBug();
    await drawPerceived(stage, mission);
    // Placed first, the units stand on a map drawn a frame stale.
    expect(stage.calls[0]).toBe("setVision");
    expect(stage.calls).toContain("update");
    expect(stage.vision).toBe(mission.vision.tdf);
  });

  it("places units and spawners together rather than one after the other (#484)", async () => {
    const stage = new StageRecorder();
    await drawPerceived(stage, missionWithBug());
    // A spawner is the mission's objective; it appears with the force.
    expect(stage.calls).toEqual(["setVision", "update", "updateSpawners"]);
  });
});

// ===========================================
// frameMission
// ===========================================

describe("frameMission", () => {
  it("points the camera at the deployed force, not the map centre (#538)", () => {
    // The force sits in one corner of an 8x8 field, so the two answers
    // are far apart and the test can tell them apart.
    const mission = missionWith(MAP, [
      unitAt("s1", "infantry", { x: 1, y: 0, z: 1 }),
      unitAt("s2", "infantry", { x: 1, y: 0, z: 2 }),
    ]);
    const framing = new FramingRecorder();
    frameMission(framing, mission);
    expect(framing.bounds).toEqual({ x: 0, z: 0, w: 8, d: 8 });
    // Tile centres, so the pair at x = 1 average to 1.5 across the tile.
    expect(framing.target?.x).toBeCloseTo(1.5);
    expect(framing.target?.z).toBeCloseTo(2);
    // The middle of this map is (4, 4); opening there puts the squad off
    // screen on a large map.
    expect(framing.target?.x).not.toBeCloseTo(4.5);
  });
});

// ===========================================
// playAroundRedraw
// ===========================================

describe("playAroundRedraw", () => {
  const moved: TacticalEvent = {
    type: UNIT_MOVED,
    payload: {
      unitId: "s1",
      from: { x: 0, y: 0, z: 0 },
      to: { x: 1, y: 0, z: 0 },
      path: [],
    },
  };
  const spotted: TacticalEvent = {
    type: UNIT_SPOTTED,
    payload: { unitId: "far", team: "tdf" },
  };

  it("redraws between the two phases, so a reveal has something to animate (#585)", async () => {
    const queue = new QueueRecorder();
    const order: string[] = [];
    await playAroundRedraw(queue, [moved, spotted], () => {
      order.push("redraw");
      return Promise.resolve();
    });
    // Collapsing the phases into one enqueue leaves the reveal playing
    // against a scene where the spotted unit has no object yet.
    expect(queue.batches).toHaveLength(2);
    expect(queue.batches[0]?.map((e) => e.type)).toEqual([UNIT_MOVED]);
    expect(queue.batches[1]?.map((e) => e.type)).toEqual([UNIT_SPOTTED]);
    expect(order).toEqual(["redraw"]);
  });

  it("runs the redraw after the first phase and before the second", async () => {
    const queue = new QueueRecorder();
    const trace: string[] = [];
    const original = queue.enqueue.bind(queue);
    queue.enqueue = (events, done) => {
      trace.push(`enqueue:${events.length}`);
      original(events, done);
    };
    await playAroundRedraw(queue, [moved, spotted], () => {
      trace.push("redraw");
      return Promise.resolve();
    });
    expect(trace).toEqual(["enqueue:1", "redraw", "enqueue:1"]);
  });

  it("still resolves when there is nothing to play", async () => {
    const queue = new QueueRecorder();
    let drew = false;
    await playAroundRedraw(queue, [], () => {
      drew = true;
      return Promise.resolve();
    });
    expect(drew).toBe(true);
    expect(queue.batches).toEqual([[], []]);
  });
});

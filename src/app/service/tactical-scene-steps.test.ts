import { describe, expect, it } from "vitest";

import type { Rect, Vec3 } from "../../core/model/grid";
import type { UnitTemplateLookup } from "../../graphics/service/tactical-scene-builder";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { SideVision, Spawner } from "../../tactical/model/tactical-state";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { UNIT_DIED } from "../../tactical/model/unit-died-event";
import { UNIT_SPOTTED } from "../../tactical/model/unit-spotted-event";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import {
  missionWith,
  openField,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { withVision } from "../../tactical/service/vision-service";
import {
  drawPerceived,
  frameMission,
  placeArrivals,
  playAroundRedraw,
} from "./tactical-scene-steps";
import type { MapExtent } from "../../graphics/service/camera-math";

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

/** An `ArrivalStage` that records what was placed where. */
class ArrivalRecorder {
  readonly arrived: { unitId: UnitId; template: string; at: TileCoord }[] = [];

  constructor(private readonly onBoard: readonly UnitId[] = []) {}

  /** The units the scene was drawing before the batch. */
  unitIds(): readonly UnitId[] {
    return this.onBoard;
  }

  /** Records the placement. */
  arrive(unit: Unit, template: UnitTemplate, at: TileCoord): Promise<void> {
    this.arrived.push({ unitId: unit.id, template: template.id, at });
    return Promise.resolve();
  }
}

/** A `SceneFraming` that records where it was aimed. */
class FramingRecorder {
  bounds: Rect | undefined;
  target: Vec3 | undefined;
  extent: MapExtent | undefined;

  /** Records the pan bounds. */
  setBounds(bounds: Rect | undefined): void {
    this.bounds = bounds;
  }

  /** Records the map the zoom range was sized to. */
  setMapExtent(extent: MapExtent | undefined): void {
    this.extent = extent;
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
// placeArrivals
// ===========================================

describe("placeArrivals (#1116)", () => {
  const step = (
    unitId: string,
    from: TileCoord,
    to: TileCoord,
  ): TacticalEvent => ({
    type: UNIT_MOVED,
    payload: { unitId, from, to, path: [to] },
  });
  const spot = (
    unitId: string,
    team: "tdf" | "bugs" = "tdf",
  ): TacticalEvent => ({
    type: UNIT_SPOTTED,
    payload: { unitId, team },
  });

  /** A squad at the origin and a bug that has just walked up next to it. */
  function walkedIn() {
    const base = missionWith(MAP, [
      unitAt("s1", "infantry", { x: 0, y: 0, z: 0 }),
      unitAt("b", "infantry", { x: 2, y: 0, z: 0 }, { team: "bugs" }),
    ]);
    const mission = withVision({ state: base, events: [] }).state;
    expect(mission.vision.tdf.spotted).toContain("b");
    const events = [
      step("b", { x: 5, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }),
      step("b", { x: 4, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }),
      step("b", { x: 3, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }),
      spot("b"),
    ];
    return { mission, events };
  }

  it("places a bug that walked into view where its walk began, so the walk can play", async () => {
    const { mission, events } = walkedIn();
    const stage = new ArrivalRecorder(["s1"]);
    const placed = await placeArrivals(stage, mission, events);
    // The first move's `from`, not the destination the state holds.
    expect(stage.arrived).toEqual([
      { unitId: "b", template: "bug:swarmer", at: { x: 5, y: 0, z: 0 } },
    ]);
    expect([...placed]).toEqual(["b"]);
  });

  it("leaves a unit the scene already draws alone", async () => {
    const { mission, events } = walkedIn();
    const stage = new ArrivalRecorder(["s1", "b"]);
    const placed = await placeArrivals(stage, mission, events);
    expect(stage.arrived).toEqual([]);
    expect(placed.size).toBe(0);
  });

  it("never places a bug that stays out of sight, whatever it did (ADR 0006)", async () => {
    const base = missionWith(MAP, [
      unitAt("s1", "infantry", { x: 0, y: 0, z: 0 }),
      unitAt("far", "infantry", { x: 7, y: 0, z: 7 }, { team: "bugs" }),
    ]);
    const mission = withVision({ state: base, events: [] }).state;
    expect(mission.vision.tdf.spotted).not.toContain("far");
    const stage = new ArrivalRecorder(["s1"]);
    const placed = await placeArrivals(stage, mission, [
      step("far", { x: 7, y: 0, z: 6 }, { x: 7, y: 0, z: 7 }),
      // The bugs' own sighting of the squad is their business.
      spot("s1", "bugs"),
    ]);
    expect(stage.arrived).toEqual([]);
    expect(placed.size).toBe(0);
  });

  it("does not place a unit spotted standing still: the reveal after the redraw handles that", async () => {
    const { mission } = walkedIn();
    const stage = new ArrivalRecorder(["s1"]);
    const placed = await placeArrivals(stage, mission, [spot("b")]);
    expect(stage.arrived).toEqual([]);
    expect(placed.size).toBe(0);
  });

  it("places a bug the squad shot on the way in, even one that died unspotted", async () => {
    // Overwatch kills it on its second step: vision at the end of the
    // batch never lists it, and the player still has to watch it happen.
    const base = missionWith(MAP, [
      unitAt("s1", "infantry", { x: 0, y: 0, z: 0 }),
      unitAt("b", "infantry", { x: 3, y: 0, z: 0 }, { team: "bugs", hp: 0 }),
    ]);
    const mission = withVision({ state: base, events: [] }).state;
    expect(mission.vision.tdf.spotted).not.toContain("b");
    const stage = new ArrivalRecorder(["s1"]);
    const placed = await placeArrivals(stage, mission, [
      step("b", { x: 5, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }),
      step("b", { x: 4, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }),
      {
        type: ATTACK_RESOLVED,
        payload: {
          attackerId: "s1",
          targetId: "b",
          hit: true,
          damage: 10,
          targetHp: 0,
          weaponRange: 8,
        },
      },
      { type: UNIT_DIED, payload: { unitId: "b", killerId: "s1" } },
    ]);
    expect(stage.arrived.map((a) => a.at)).toEqual([{ x: 5, y: 0, z: 0 }]);
    expect([...placed]).toEqual(["b"]);
  });

  it("does not place a bug that only a bug fired on", async () => {
    const base = missionWith(MAP, [
      unitAt("s1", "infantry", { x: 0, y: 0, z: 0 }),
      unitAt("b", "infantry", { x: 7, y: 0, z: 7 }, { team: "bugs" }),
      unitAt("c", "infantry", { x: 7, y: 0, z: 6 }, { team: "bugs" }),
    ]);
    const mission = withVision({ state: base, events: [] }).state;
    const stage = new ArrivalRecorder(["s1"]);
    const placed = await placeArrivals(stage, mission, [
      step("b", { x: 6, y: 0, z: 7 }, { x: 7, y: 0, z: 7 }),
      {
        type: ATTACK_RESOLVED,
        payload: {
          attackerId: "c",
          targetId: "b",
          hit: true,
          damage: 1,
          targetHp: 9,
          weaponRange: 1,
        },
      },
    ]);
    expect(stage.arrived).toEqual([]);
    expect(placed.size).toBe(0);
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

  it("plays an arrival's spot and walk before the redraw, since it is already on the board (#1116)", async () => {
    const queue = new QueueRecorder();
    const walk: TacticalEvent = {
      type: UNIT_MOVED,
      payload: {
        unitId: "far",
        from: { x: 7, y: 0, z: 6 },
        to: { x: 7, y: 0, z: 7 },
        path: [{ x: 7, y: 0, z: 7 }],
      },
    };
    await playAroundRedraw(
      queue,
      [walk, spotted],
      () => Promise.resolve(),
      undefined,
      new Set(["far"]),
    );
    expect(queue.batches[0]?.map((e) => e.type)).toEqual([
      UNIT_SPOTTED,
      UNIT_MOVED,
    ]);
    expect(queue.batches[1]).toEqual([]);
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

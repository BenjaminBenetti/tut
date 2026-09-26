import { describe, expect, it, vi } from "vitest";

import type { Rect, Vec3 } from "../../core/model/grid";
import type { UnitTemplateLookup } from "../../graphics/service/tactical-scene-builder";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TileEffect } from "../../tactical/model/tile-effect";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type {
  SideVision,
  Spawner,
  SpawnerId,
} from "../../tactical/model/tactical-state";
import type { ObjectiveMarker } from "../../tactical/model/objective-marker";
import type { TechCarcass } from "../../tactical/model/tech-carcass";
import type { DroppedSpecimen } from "../../tactical/service/specimen-service";
import type { MechWreck } from "../../tactical/model/mech-wreck";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { UNIT_DIED } from "../../tactical/model/unit-died-event";
import { UNIT_SPOTTED } from "../../tactical/model/unit-spotted-event";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import { UNIT_SURFACED } from "../../tactical/model/unit-surfaced-event";
import { UNIT_TUNNELLED } from "../../tactical/model/unit-tunnelled-event";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import {
  burrowerAt,
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
  ripe: ReadonlySet<SpawnerId> | undefined;
  carcasses: readonly TechCarcass[] = [];
  specimens: readonly DroppedSpecimen[] = [];
  wrecks: readonly MechWreck[] = [];
  effects: readonly TileEffect[] = [];
  markers: readonly ObjectiveMarker[] = [];

  /** Records the map handed to the scene (#1121). */
  applyMap(_map: TacticalMap): void {
    this.calls.push("applyMap");
  }

  /** Records the radar layer update. */
  updateRadar(): Promise<void> {
    this.calls.push("updateRadar");
    return Promise.resolve();
  }

  /** Records the objective markers handed to the scene (#1173). */
  updateObjectiveMarkers(markers: readonly ObjectiveMarker[]): void {
    this.calls.push("updateObjectiveMarkers");
    this.markers = markers;
  }

  /** Records the vision handed to the scene. */
  setVision(vision: SideVision | undefined): void {
    this.calls.push("setVision");
    this.vision = vision;
  }

  /** Records the fires the scene was asked to draw (#1121). */
  updateEffects(effects: readonly TileEffect[]): void {
    this.calls.push("updateEffects");
    this.effects = effects;
  }

  /** Records the charges the scene was asked to draw (#1132). */
  updateCharges(): void {
    this.calls.push("updateCharges");
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

  /** Records the spawners the scene was asked to draw, and which are ripe. */
  updateSpawners(
    spawners: readonly Spawner[],
    ripe?: ReadonlySet<SpawnerId>,
  ): Promise<void> {
    this.calls.push("updateSpawners");
    this.spawners = spawners;
    this.ripe = ripe;
    return Promise.resolve();
  }

  /** Records the carcasses the scene was asked to draw (#1171). */
  updateCarcasses(carcasses: readonly TechCarcass[]): Promise<void> {
    this.calls.push("updateCarcasses");
    this.carcasses = carcasses;
    return Promise.resolve();
  }

  /** Records the dropped specimens the scene was asked to draw (#1179). */
  updateSpecimens(
    specimens: readonly DroppedSpecimen[],
    _templates: UnitTemplateLookup,
  ): Promise<void> {
    this.calls.push("updateSpecimens");
    this.specimens = specimens;
    return Promise.resolve();
  }

  /** Records the wrecks the scene was asked to draw (arc §6.6). */
  updateWrecks(wrecks: readonly MechWreck[]): Promise<void> {
    this.calls.push("updateWrecks");
    this.wrecks = wrecks;
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
    expect(stage.calls.slice(0, 2)).toEqual(["applyMap", "setVision"]);
    expect(stage.calls).toContain("update");
    expect(stage.vision).toBe(mission.vision.tdf);
  });

  it("places units and spawners together rather than one after the other (#484)", async () => {
    const stage = new StageRecorder();
    await drawPerceived(stage, missionWithBug());
    // A spawner is the mission's objective; it appears with the force.
    expect(stage.calls).toEqual([
      "applyMap",
      "setVision",
      "updateEffects",
      "updateCharges",
      "updateObjectiveMarkers",
      "update",
      "updateSpawners",
      "updateCarcasses",
      "updateSpecimens",
      "updateWrecks",
      "updateRadar",
    ]);
  });

  it("draws only the carcasses on ground the player has explored (#1171)", async () => {
    const base = missionWith(
      MAP,
      [unitAt("s1", "infantry", { x: 0, y: 0, z: 0 })],
      {
        carcasses: [
          {
            id: "near",
            pos: { x: 1, y: 0, z: 1 },
            techPoints: 5,
            harvested: false,
          },
          {
            id: "dark",
            pos: { x: 7, y: 0, z: 7 },
            techPoints: 5,
            harvested: false,
          },
        ],
      },
    );
    // Nobody has looked yet: an empty explored set hides both.
    const stage = new StageRecorder();
    await drawPerceived(stage, base);
    expect(stage.carcasses).toEqual([]);
    // A real look from (0,0) on an open field lights the near one and
    // leaves the far corner dark.
    const seen = withVision({ state: base, events: [] }).state;
    const lit = new StageRecorder();
    await drawPerceived(lit, seen);
    expect(lit.carcasses.map((c) => c.id)).toContain("near");
    expect(lit.carcasses.map((c) => c.id)).not.toContain("dark");
  });

  it("draws the specimen a fallen carrier dropped, and not the one a living squad still holds (#1179)", async () => {
    const lurker = {
      unitId: "lurker-1",
      species: "lurker",
      templateId: "bug:lurker",
      movePenalty: 1,
    } as const;
    const base = missionWith(MAP, [
      { ...unitAt("s1", "infantry", { x: 0, y: 0, z: 0 }), carrying: lurker },
      {
        ...unitAt("s2", "infantry", { x: 1, y: 0, z: 1 }, { hp: 0 }),
        carrying: lurker,
      },
    ]);
    // Ground nobody has explored withholds it, like a carcass.
    const unseen = new StageRecorder();
    await drawPerceived(unseen, base);
    expect(unseen.specimens).toEqual([]);
    const stage = new StageRecorder();
    await drawPerceived(stage, withVision({ state: base, events: [] }).state);
    expect(stage.specimens.map((s) => s.carrierId)).toEqual(["s2"]);
    expect(stage.specimens[0]?.pos).toEqual({ x: 1, y: 0, z: 1 });
  });

  it("draws only the wrecks the player has explored a tile of (arc §6.6)", async () => {
    /** A 3 × 3 wreck with its corner at (x, z). */
    const wreckAt = (id: string, x: number, z: number): MechWreck => ({
      id,
      pos: { x: x + 1, y: 0, z: z + 1 },
      tiles: [z, z + 1, z + 2].flatMap((tz) =>
        [x, x + 1, x + 2].map((tx) => ({ x: tx, y: 0, z: tz })),
      ),
      mechName: "Anvil",
      loadout: STARTER_LOADOUT,
    });
    const base = {
      ...missionWith(MAP, [unitAt("s1", "infantry", { x: 0, y: 0, z: 0 })]),
      wrecks: [wreckAt("near", 1, 1), wreckAt("dark", 5, 5)],
    };
    // Nobody has looked yet: an empty explored set hides both.
    const stage = new StageRecorder();
    await drawPerceived(stage, base);
    expect(stage.wrecks).toEqual([]);
    const seen = withVision({ state: base, events: [] }).state;
    const lit = new StageRecorder();
    await drawPerceived(lit, seen);
    expect(lit.wrecks.map((w) => w.id)).toContain("near");
    expect(lit.wrecks.map((w) => w.id)).not.toContain("dark");
  });

  it("marks the open objective in the fog and withholds its model until explored (#1173)", async () => {
    const dark = { x: 7, y: 0, z: 7 };
    const base = missionWith(
      MAP,
      [unitAt("s1", "infantry", { x: 0, y: 0, z: 0 })],
      {
        spawners: [
          {
            id: "nest",
            pos: dark,
            hp: 20,
            destroyed: false,
            timer: 3,
            hatchRadius: 3,
          },
        ],
        objectives: [
          {
            id: "o",
            kind: "destroy-spawner",
            targetId: "nest",
            complete: false,
          },
        ],
      },
    );
    const seen = withVision({ state: base, events: [] }).state;
    const stage = new StageRecorder();
    await drawPerceived(stage, seen);
    // Nobody has seen the corner: no spawner model, but its whereabouts are marked.
    expect(stage.spawners).toEqual([]);
    expect(stage.markers).toEqual([{ objectiveId: "o", pos: dark }]);
    // Destroyed and complete: the mission moves on and the mark goes.
    const done = new StageRecorder();
    await drawPerceived(done, {
      ...seen,
      spawners: [{ ...seen.spawners[0]!, destroyed: true, hp: 0 }],
      objectives: [{ ...seen.objectives[0]!, complete: true }],
    });
    expect(done.markers).toEqual([]);
  });

  it("ripens a spore pod in its last two turns, from the tracker's own countdown (#1179)", async () => {
    const base = missionWith(
      MAP,
      [unitAt("s1", "infantry", { x: 0, y: 0, z: 0 })],
      {
        turn: 6,
        spawners: [
          {
            id: "pod",
            variant: "spore-pod",
            pos: { x: 1, y: 0, z: 1 },
            hp: 40,
            destroyed: false,
            timer: 0,
            hatchRadius: 2,
          },
        ],
        objectives: [
          {
            id: "o",
            kind: "destroy-pod",
            targetId: "pod",
            complete: false,
            deadlineTurn: 8,
          },
        ],
      },
    );
    const seen = withVision({ state: base, events: [] }).state;
    const early = new StageRecorder();
    await drawPerceived(early, seen);
    expect(early.spawners.map((s) => s.id)).toEqual(["pod"]);
    expect([...(early.ripe ?? [])]).toEqual([]);
    const late = new StageRecorder();
    await drawPerceived(late, { ...seen, turn: 7 });
    expect([...(late.ripe ?? [])]).toEqual(["pod"]);
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

describe("placeArrivals for a burrower (#1179)", () => {
  const tunnelled = (from: TileCoord, to: TileCoord): TacticalEvent => ({
    type: UNIT_TUNNELLED,
    payload: { unitId: "d", from, to },
  });
  const surfaced = (pos: TileCoord): TacticalEvent => ({
    type: UNIT_SURFACED,
    payload: { unitId: "d", pos, beside: ["s1"] },
  });

  /** The squad at the origin and the burrower `d` at `pos`, looked at for real. */
  function withDigger(pos: TileCoord, up: boolean) {
    const base = missionWith(MAP, [
      unitAt("s1", "infantry", { x: 0, y: 0, z: 0 }),
      burrowerAt("d", pos, up ? { status: [] } : {}),
    ]);
    return withVision({ state: base, events: [] }).state;
  }

  it("places a burrower that came up in view on the tile it came up on, not where it dug from", async () => {
    const mission = withDigger({ x: 1, y: 0, z: 0 }, true);
    expect(mission.vision.tdf.spotted).toContain("d");
    const stage = new ArrivalRecorder(["s1"]);
    const placed = await placeArrivals(stage, mission, [
      tunnelled({ x: 6, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
      surfaced({ x: 1, y: 0, z: 0 }),
    ]);
    expect(stage.arrived).toEqual([
      { unitId: "d", template: "bug:burrower", at: { x: 1, y: 0, z: 0 } },
    ]);
    expect([...placed]).toEqual(["d"]);
  });

  it("places it where it came up when it walked on afterwards", async () => {
    const mission = withDigger({ x: 1, y: 0, z: 1 }, true);
    const stage = new ArrivalRecorder(["s1"]);
    await placeArrivals(stage, mission, [
      surfaced({ x: 2, y: 0, z: 1 }),
      {
        type: UNIT_MOVED,
        payload: {
          unitId: "d",
          from: { x: 2, y: 0, z: 1 },
          to: { x: 1, y: 0, z: 1 },
          path: [{ x: 1, y: 0, z: 1 }],
        },
      },
    ]);
    expect(stage.arrived.map((a) => a.at)).toEqual([{ x: 2, y: 0, z: 1 }]);
  });

  it("never places one still under the ground, however near it dug (ADR 0006)", async () => {
    const mission = withDigger({ x: 1, y: 0, z: 0 }, false);
    expect(mission.vision.tdf.spotted).not.toContain("d");
    const stage = new ArrivalRecorder(["s1"]);
    const placed = await placeArrivals(stage, mission, [
      tunnelled({ x: 6, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
    ]);
    expect(stage.arrived).toEqual([]);
    expect(placed.size).toBe(0);
  });

  it("never places one that came up out of sight", async () => {
    const mission = withDigger({ x: 7, y: 0, z: 7 }, true);
    expect(mission.vision.tdf.spotted).not.toContain("d");
    const stage = new ArrivalRecorder(["s1"]);
    const placed = await placeArrivals(stage, mission, [
      surfaced({ x: 7, y: 0, z: 7 }),
    ]);
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

  it("still plays the second phase and resolves when the redraw rejects (#1132)", async () => {
    const queue = new QueueRecorder();
    const boom = new Error("template missing");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      // Swallowed: the assertion below is what this test is about.
    });
    // The promise here is what releases the player's controls; a
    // rejection that left it pending held them for a whole CI budget.
    await playAroundRedraw(queue, [moved, spotted], () => Promise.reject(boom));
    expect(queue.batches.map((batch) => batch.map((e) => e.type))).toEqual([
      [UNIT_MOVED],
      [UNIT_SPOTTED],
    ]);
    expect(logged).toHaveBeenCalledWith("Tactical redraw failed", boom);
    logged.mockRestore();
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

import { Object3D, Texture } from "three";
import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { SpriteSource } from "../model/sprite-source";
import { tileTopCentre } from "../view/tactical-map-view";
import type { AnimationScene } from "./tactical-animation-queue";
import { TacticalAnimationQueue } from "./tactical-animation-queue";

// ===========================================
// Fixtures
// ===========================================

/** A scene with two units on a flat map. */
function scene(): AnimationScene & { objects: Map<string, Object3D> } {
  const objects = new Map<string, Object3D>();
  for (const [id, x] of [
    ["unit-1", 0],
    ["unit-2", 4],
  ] as const) {
    const o = new Object3D();
    const c = tileTopCentre({ x, y: 0, z: 0 });
    o.position.set(c.x, c.y, c.z);
    objects.set(id, o);
  }
  return {
    objects,
    unitObject: (id) => objects.get(id),
    tileWorldPosition: (tile: TileCoord) => tileTopCentre(tile),
  };
}

const sprites: SpriteSource = {
  loadSprite: () => Promise.resolve(new Texture()),
};

const TIMING = {
  stepSeconds: 0.1,
  attackSeconds: 0.2,
  floaterSeconds: 0.2,
  deathSeconds: 0.2,
};

const MOVE: TacticalEvent = {
  type: "tactical:unit-moved",
  payload: {
    unitId: "unit-1",
    from: { x: 0, y: 0, z: 0 },
    to: { x: 2, y: 0, z: 0 },
    path: [
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
  },
};
const ATTACK: TacticalEvent = {
  type: "tactical:attack-resolved",
  payload: {
    attackerId: "unit-1",
    targetId: "unit-2",
    hit: true,
    damage: 7,
    targetHp: 3,
  },
};
const DEATH: TacticalEvent = {
  type: "tactical:unit-died",
  payload: { unitId: "unit-2", killerId: "unit-1" },
};
const TURN: TacticalEvent = {
  type: "tactical:turn-started",
  payload: { turn: 2, phase: "player" },
};

// ===========================================
// Tests
// ===========================================

describe("TacticalAnimationQueue", () => {
  it("plays a move tile by tile over time and lands exactly on the destination", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    let done = false;
    queue.enqueue([MOVE], () => {
      done = true;
    });
    expect(queue.busy).toBe(true);
    queue.update(0.05);
    const unit = s.objects.get("unit-1")!;
    expect(unit.position.x).toBeGreaterThan(0.5);
    expect(unit.position.x).toBeLessThan(1.5);
    expect(done).toBe(false);
    queue.update(0.2);
    expect(unit.position.x).toBeCloseTo(2.5);
    expect(done).toBe(true);
    expect(queue.busy).toBe(false);
  });

  it("replays a batch in order, each callback after its last event, passing through silent events", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    const order: string[] = [];
    queue.enqueue([TURN, MOVE], () => order.push("first"));
    queue.enqueue([ATTACK, DEATH], () => order.push("second"));
    queue.update(0.05);
    expect(order).toEqual([]);
    expect(queue.root.children).toHaveLength(0);
    queue.update(0.2);
    expect(order).toEqual(["first"]);
    queue.update(0.05);
    // The attack has spawned its billboards: flash, impact and floater.
    expect(queue.root.children.length).toBe(3);
    queue.update(1);
    expect(order).toEqual(["first", "second"]);
    expect(queue.root.children).toHaveLength(0);
    expect(s.objects.get("unit-2")!.scale.x).toBeLessThan(0.05);
  });

  it("instant mode finishes everything on enqueue", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
      instant: true,
    });
    let done = 0;
    queue.enqueue([MOVE, ATTACK, DEATH], () => {
      done++;
    });
    expect(done).toBe(1);
    expect(queue.busy).toBe(false);
    expect(s.objects.get("unit-1")!.position.x).toBeCloseTo(2.5);
    expect(s.objects.get("unit-2")!.scale.x).toBeLessThan(0.05);
    expect(queue.root.children).toHaveLength(0);
  });

  it("skip finishes what is in flight and setInstant flushes", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    let done = false;
    queue.enqueue([MOVE, ATTACK], () => {
      done = true;
    });
    queue.update(0.05);
    queue.setInstant(true);
    expect(done).toBe(true);
    expect(s.objects.get("unit-1")!.position.x).toBeCloseTo(2.5);
    expect(queue.busy).toBe(false);
  });

  it("skips events for units the scene no longer has and still calls back", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    let done = false;
    queue.enqueue([{ ...DEATH, payload: { unitId: "ghost" } }], () => {
      done = true;
    });
    queue.update(0.01);
    expect(done).toBe(true);
    queue.enqueue([], () => {
      done = false;
    });
    expect(done).toBe(false);
  });
});

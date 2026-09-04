import { Object3D, Texture } from "three";
import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import { MODEL_MANIFEST } from "../data/model-manifest";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { SpriteSource } from "../model/sprite-source";
import { tileTopCentre } from "../view/tactical-map-view";
import type { AnimationScene } from "./tactical-animation-queue";
import { TacticalAnimationQueue } from "./tactical-animation-queue";

// ===========================================
// Fixtures
// ===========================================

/** A scene with two units and one egg spawner on a flat map. */
function scene(): AnimationScene & { objects: Map<string, Object3D> } {
  const objects = new Map<string, Object3D>();
  const spawners = new Set<string>(["spawner-1"]);
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
    // A mech-sized unit: tall enough that a fixed lift above the feet would
    // put its damage number inside the model, which is the bug #514 fixed.
    unitHeight: (id) => (objects.has(id) ? 2.8 : undefined),
    unitModelId: (id) => (objects.has(id) ? "tdf.mech.assembled-b" : undefined),
    spawnerWorldPosition: (id) =>
      spawners.has(id) ? { x: 4, y: 0, z: 5 } : undefined,
    spawnerHeight: (id) => (spawners.has(id) ? 1.4 : undefined),
  };
}

const sprites: SpriteSource = {
  loadSprite: () => Promise.resolve(new Texture()),
};

const TIMING = {
  stepSeconds: 0.1,
  flashSeconds: 0.1,
  tracerSeconds: 0.1,
  impactSeconds: 0.1,
  floaterSeconds: 0.2,
  deathSeconds: 0.2,
  revealSeconds: 0.2,
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
    // The attack has spawned its billboards: flash, tracer, impact and floater.
    expect(queue.root.children.length).toBe(4);
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
  it("floats the damage number above the unit, never inside it (#514)", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([ATTACK]);
    // Past the flash and the tracer, so the number is placed and visible.
    queue.update(TIMING.flashSeconds + TIMING.tracerSeconds + 0.01);
    const feet = s.objects.get("unit-2")?.position.y ?? 0;
    const height = s.unitHeight("unit-2") ?? 0;
    const floater = queue.root.children.find((child) =>
      child.name.startsWith("vfx.floater"),
    );
    expect(floater).toBeDefined();
    // The Executive Director's complaint: on a 2.8 u mech a fixed 0.6 u lift
    // put the number in the legs. It has to clear the whole model.
    expect(floater?.position.y).toBeGreaterThan(feet + height);
  });

  it("anchors text above the tallest unit model anyone can field", () => {
    // The fixture's height is not special: nothing in the registry may poke
    // through a damage number, so measure against the tallest of them.
    const tallest = Math.max(
      ...Object.values(MODEL_MANIFEST)
        .filter(
          (entry) => entry.category === "units" || entry.category === "bugs",
        )
        .map((entry) => entry.height),
    );
    const s = scene();
    const heights: Record<string, number> = {
      "unit-1": tallest,
      "unit-2": tallest,
    };
    const tall: AnimationScene = { ...s, unitHeight: (id) => heights[id] };
    const queue = new TacticalAnimationQueue({
      scene: tall,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([ATTACK]);
    queue.update(TIMING.flashSeconds + TIMING.tracerSeconds + 0.01);
    const feet = s.objects.get("unit-2")?.position.y ?? 0;
    const floater = queue.root.children.find((child) =>
      child.name.startsWith("vfx.floater"),
    );
    expect(floater?.position.y).toBeGreaterThan(feet + tallest);
  });

  it("shows one number at a time, so they never overlap", () => {
    // #524 asks for overlapping numbers to stagger. They cannot overlap: the
    // queue plays one event at a time and each attack clears its own
    // billboards before the next starts. This test is here so that stays true.
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([ATTACK, ATTACK]);
    queue.update(TIMING.flashSeconds + TIMING.tracerSeconds + 0.01);
    const floaters = () =>
      queue.root.children.filter((child) =>
        child.name.startsWith("vfx.floater"),
      );
    expect(floaters().length).toBe(1);
    queue.update(5);
    expect(floaters().length).toBe(0);
  });

  it("swings a claw instead of firing when the attacker is adjacent", () => {
    const s = scene();
    // Put the target one tile away: a melee strike, not a shot.
    const next = tileTopCentre({ x: 1, y: 0, z: 0 });
    s.objects.get("unit-2")?.position.set(next.x, next.y, next.z);
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([ATTACK]);
    queue.update(0.01);
    const names = queue.root.children.map((child) => child.name);
    expect(names).toContain("vfx.claw-slash");
    expect(names).not.toContain("vfx.tracer");
    expect(names).not.toContain("vfx.muzzle-flash");
  });

  it("bursts a dying unit with the effect its model calls for", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([DEATH]);
    queue.update(0.01);
    expect(queue.root.children.map((child) => child.name)).toContain(
      "vfx.tdf-death",
    );
  });
});

// ===========================================
// Egg burst (#697)
// ===========================================

describe("TacticalAnimationQueue egg burst", () => {
  const charges = (destroyed: boolean): TacticalEvent => ({
    type: "tactical:spawner-damaged",
    payload: {
      spawnerId: "spawner-1",
      unitId: "unit-1",
      damage: 10,
      hp: destroyed ? 0 : 10,
      destroyed,
    },
  });

  it("bursts the spawner that the charges finished off", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([charges(true)]);
    queue.update(0.01);
    // Destroying spawners is the mission; until #697 it resolved with
    // nothing on screen while the sprite sat preloaded and undrawn.
    expect(queue.root.children.map((child) => child.name)).toContain(
      "vfx.egg-burst",
    );
  });

  it("plays nothing when the spawner survives the charges", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([charges(false)]);
    queue.update(0.01);
    // The attack sequence has already shown the strike; a second effect
    // on every hit would say the spawner died when it did not.
    expect(queue.root.children.map((child) => child.name)).not.toContain(
      "vfx.egg-burst",
    );
  });

  it("clears the burst once it has run", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([charges(true)]);
    queue.update(0.01);
    queue.update(TIMING.deathSeconds + 0.01);
    expect(queue.root.children.map((child) => child.name)).not.toContain(
      "vfx.egg-burst",
    );
  });
});

// ===========================================
// Reveal (#585)
// ===========================================

describe("TacticalAnimationQueue reveal", () => {
  const spotted = (unitId: string, team: "tdf" | "bugs"): TacticalEvent => ({
    type: "tactical:unit-spotted",
    payload: { unitId, team },
  });

  it("swells a spotted enemy from nothing to full size", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    const object = s.unitObject("unit-1");
    if (!object) throw new Error("fixture has no unit-1");
    queue.enqueue([spotted("unit-1", "tdf")], () => undefined);

    // It starts collapsed, so the enemy does not pop in at full size.
    queue.update(0.001);
    expect(object.scale.x).toBeLessThan(0.1);
    queue.update(TIMING.revealSeconds / 2);
    expect(object.scale.x).toBeGreaterThan(0.3);
    expect(object.scale.x).toBeLessThan(1);
    queue.update(TIMING.revealSeconds);
    expect(object.scale.x).toBe(1);
  });

  it("ignores a spot on the bugs' side, which the player never sees", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    const object = s.unitObject("unit-1");
    if (!object) throw new Error("fixture has no unit-1");
    let done = false;
    queue.enqueue([spotted("unit-1", "bugs")], () => {
      done = true;
    });
    queue.update(0.01);
    // Nothing animated, and the unit was left exactly as it was.
    expect(object.scale.x).toBe(1);
    expect(done).toBe(true);
  });

  it("skips a spot for a unit the scene does not have, and still calls back", () => {
    // This is the ordering trap the issue was filed for: before the host
    // places units, a newly spotted enemy has no object at all.
    const queue = new TacticalAnimationQueue({
      scene: scene(),
      sprites,
      timing: TIMING,
    });
    let done = false;
    queue.enqueue([spotted("never-placed", "tdf")], () => {
      done = true;
    });
    queue.update(TIMING.revealSeconds * 2);
    expect(done).toBe(true);
  });
});

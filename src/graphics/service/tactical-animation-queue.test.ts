import { Object3D, Texture } from "three";
import { describe, expect, it, vi } from "vitest";

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
/** Tiles a rifle reaches; anything past `MELEE_RANGE` picks the shot effects. */
const RIFLE_RANGE = 8;

/** Tiles a claw reaches: it has to be in contact. */
const CLAW_RANGE = 1;

/** An attack by a unit holding a rifle, wherever the two models happen to be. */
function attack(weaponRange: number): TacticalEvent {
  return {
    type: "tactical:attack-resolved",
    payload: {
      attackerId: "unit-1",
      targetId: "unit-2",
      hit: true,
      damage: 7,
      targetHp: 3,
      weaponRange,
    },
  };
}

const ATTACK: TacticalEvent = attack(RIFLE_RANGE);
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

  it("walks a unit through the centres of its footprint when the scene knows them (#1130)", () => {
    const base = scene();
    // A 2×2 unit-1: its feet are one tile past each anchor's corner.
    const s: AnimationScene & { objects: Map<string, Object3D> } = {
      ...base,
      unitWorldPositionAt: (id, tile) =>
        id === "unit-1"
          ? { x: tile.x + 1, y: tileTopCentre(tile).y, z: tile.z + 1 }
          : undefined,
    };
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([MOVE], () => undefined);
    queue.update(1);
    const unit = s.objects.get("unit-1")!;
    // Anchor (2, 0) → feet at (3, 1), not the tile centre (2.5, 0.5).
    expect(unit.position.x).toBeCloseTo(3);
    expect(unit.position.z).toBeCloseTo(1);
    // A unit the scene has no footprint answer for walks tile centres.
    queue.enqueue(
      [
        {
          type: "tactical:unit-moved",
          payload: {
            unitId: "unit-2",
            from: { x: 4, y: 0, z: 0 },
            to: { x: 4, y: 0, z: 2 },
            path: [{ x: 4, y: 0, z: 2 }],
          },
        },
      ],
      () => undefined,
    );
    queue.update(1);
    expect(s.objects.get("unit-2")!.position.z).toBeCloseTo(2.5);
  });

  it("a walk shows a unit that was waiting hidden for it (#1116)", () => {
    const s = scene();
    const unit = s.objects.get("unit-1")!;
    unit.visible = false;
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([MOVE], () => undefined);
    queue.update(0.05);
    // Shown as the first step begins, not when the walk ends: the unit
    // is meant to be seen walking in.
    expect(unit.visible).toBe(true);
    expect(unit.position.x).toBeLessThan(1.5);
  });

  it("a reveal shows a unit that was waiting hidden for it (#1116)", () => {
    const s = scene();
    const unit = s.objects.get("unit-2")!;
    unit.visible = false;
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue(
      [
        {
          type: "tactical:unit-spotted",
          payload: { unitId: "unit-2", team: "tdf" },
        },
      ],
      () => undefined,
    );
    queue.update(0.05);
    expect(unit.visible).toBe(true);
    expect(unit.scale.x).toBeGreaterThan(0.01);
    expect(unit.scale.x).toBeLessThan(1);
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

  it("swings a claw when the weapon has to be in contact", () => {
    const s = scene();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([attack(CLAW_RANGE)]);
    queue.update(0.01);
    const names = queue.root.children.map((child) => child.name);
    expect(names).toContain("vfx.claw-slash");
    expect(names).not.toContain("vfx.tracer");
    expect(names).not.toContain("vfx.muzzle-flash");
  });

  // The two cases the old heuristic got backwards (#457). It chose the
  // effect by measuring the gap between the models, which answers "are
  // they close" — a different question from "what is he holding".

  it("fires, not claws, when a rifle shoots the tile next door", () => {
    const s = scene();
    // In contact, and still a shot: a rifle squad at point-blank range.
    const next = tileTopCentre({ x: 1, y: 0, z: 0 });
    s.objects.get("unit-2")?.position.set(next.x, next.y, next.z);
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([attack(RIFLE_RANGE)]);
    queue.update(0.01);
    const names = queue.root.children.map((child) => child.name);
    expect(names).toContain("vfx.muzzle-flash");
    expect(names).toContain("vfx.tracer");
    expect(names).not.toContain("vfx.claw-slash");
  });

  it("claws, not fires, when a melee attacker strikes from a rooftop", () => {
    const s = scene();
    // Adjacent on the ground and four layers up: three world units apart,
    // well past any distance a contact weapon would pass.
    const roof = tileTopCentre({ x: 1, y: 4, z: 0 });
    s.objects.get("unit-2")?.position.set(roof.x, roof.y, roof.z);
    expect(
      s.objects
        .get("unit-2")!
        .position.distanceTo(s.objects.get("unit-1")!.position),
    ).toBeGreaterThan(2);
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    queue.enqueue([attack(CLAW_RANGE)]);
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

describe("unit action poses", () => {
  /** A pose port wired exactly as the scene builder exposes its unit mesh. */
  function animatedScene() {
    const s = scene();
    const motion = { walk: vi.fn(), attack: vi.fn(), reset: vi.fn() };
    s.unitMotion = (id) => (id === "unit-1" ? motion : undefined);
    return {
      s,
      motion,
      queue: new TacticalAnimationQueue({ scene: s, sprites, timing: TIMING }),
    };
  }

  it("turns along each path segment while sampling strides, then settles", () => {
    const { s, motion, queue } = animatedScene();
    queue.enqueue([
      {
        type: "tactical:unit-moved",
        payload: {
          unitId: "unit-1",
          from: { x: 0, y: 0, z: 0 },
          to: { x: 1, y: 1, z: 1 },
          path: [
            { x: 1, y: 0, z: 0 },
            { x: 1, y: 1, z: 1 },
          ],
        },
      },
    ]);
    queue.update(0.025);
    expect(s.objects.get("unit-1")!.rotation.y).toBeCloseTo(-Math.PI / 2);
    expect(motion.walk).toHaveBeenLastCalledWith(0.25);
    queue.update(0.1);
    expect(Math.abs(s.objects.get("unit-1")!.rotation.y)).toBeCloseTo(Math.PI);
    queue.update(1);
    expect(motion.reset).toHaveBeenCalledOnce();
    expect(s.objects.get("unit-1")!.position.y).toBeCloseTo(
      tileTopCentre({ x: 1, y: 1, z: 1 }).y,
    );
    expect(queue.busy).toBe(false);
  });

  it.each([false, true])(
    "carries the gait between tile events (skip first: %s)",
    (skipFirst) => {
      const { motion, queue } = animatedScene();
      const step = (fromX: number): TacticalEvent => ({
        type: "tactical:unit-moved",
        payload: {
          unitId: "unit-1",
          from: { x: fromX, y: 0, z: 0 },
          to: { x: fromX + 1, y: 0, z: 0 },
          path: [{ x: fromX + 1, y: 0, z: 0 }],
        },
      });
      queue.enqueue([step(0)]);
      queue.update(0.05);
      expect(motion.walk).toHaveBeenLastCalledWith(0.5);
      if (skipFirst) queue.skip();
      else queue.update(0.05);
      queue.enqueue([step(1)]);
      queue.update(0.05);
      expect(motion.walk).toHaveBeenLastCalledWith(1.5);
    },
  );

  it.each([RIFLE_RANGE, CLAW_RANGE])(
    "aims and samples the weapon's attack pose at range %s",
    (range) => {
      const { s, motion, queue } = animatedScene();
      const yaw = s.objects.get("unit-1")!.rotation.y;
      queue.enqueue([attack(range)]);
      queue.update(0.035);
      expect(s.objects.get("unit-1")!.rotation.y).toBeCloseTo(-Math.PI / 2);
      expect(motion.attack).toHaveBeenCalledWith(
        expect.any(Number),
        range === CLAW_RANGE,
      );
      queue.update(2);
      expect(motion.reset).toHaveBeenCalledOnce();
      expect(s.objects.get("unit-1")!.rotation.y).toBe(yaw);
    },
  );

  it.each([MOVE, ATTACK])(
    "resets an in-flight $type on skip and disposal",
    (event) => {
      for (const finish of ["skip", "dispose"] as const) {
        const { motion, queue } = animatedScene();
        queue.enqueue([event]);
        queue.update(0.025);
        queue[finish]();
        expect(motion.reset).toHaveBeenCalled();
        expect(queue.busy).toBe(false);
        expect(queue.root.children).toHaveLength(0);
      }
    },
  );

  it("finishes instantly without leaving a stride or recoil applied", () => {
    const { motion, queue } = animatedScene();
    queue.setInstant(true);
    queue.enqueue([MOVE, ATTACK]);
    expect(motion.walk).not.toHaveBeenCalled();
    expect(motion.attack).not.toHaveBeenCalled();
    expect(motion.reset).toHaveBeenCalledTimes(2);
  });
});

// ===========================================
// Blasts (#1130)
// ===========================================

describe("TacticalAnimationQueue blast", () => {
  /** The starter mech's missile pod bursting on unit-2's tile and catching unit-3 beside it. */
  const BLAST: TacticalEvent = {
    type: "tactical:blast-resolved",
    payload: {
      attackerId: "unit-1",
      impact: { x: 4, y: 0, z: 0 },
      hit: true,
      radius: 1,
      aimedAtTile: false,
      weaponRange: RIFLE_RANGE,
      victims: [{ targetId: "unit-3", kind: "unit", damage: 4, hp: 6 }],
    },
  };
  const DEATH_3: TacticalEvent = {
    type: "tactical:unit-died",
    payload: { unitId: "unit-3", killerId: "unit-1" },
  };

  /** The two-unit scene with a third unit on the tile beside unit-2. */
  function withThird(): ReturnType<typeof scene> {
    const s = scene();
    const o = new Object3D();
    const c = tileTopCentre({ x: 5, y: 0, z: 0 });
    o.position.set(c.x, c.y, c.z);
    s.objects.set("unit-3", o);
    return s;
  }

  /** Billboards under the queue whose name starts with `prefix`. */
  function named(queue: TacticalAnimationQueue, prefix: string): string[] {
    return queue.root.children
      .map((child) => child.name)
      .filter((name) => name.startsWith(prefix))
      .sort();
  }

  it("plays the shot, its deaths and its blast as one explosion, announced in order as the shell leaves", () => {
    const s = withThird();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    const started: string[] = [];
    let done = 0;
    queue.enqueue(
      [ATTACK, DEATH, DEATH_3, BLAST],
      () => {
        done++;
      },
      (event) => started.push(event.type),
    );
    queue.update(0.05);
    // The HUD hears every event of the blast, in order, before the first frame.
    expect(started).toEqual([
      ATTACK.type,
      DEATH.type,
      DEATH_3.type,
      BLAST.type,
    ]);
    // In flight: flash and tracer only. Nobody has been hit yet, so no
    // number stands and nobody has begun to fall.
    expect(named(queue, "vfx.floater")).toEqual([]);
    expect(named(queue, "vfx.blast")).toEqual([]);
    expect(s.objects.get("unit-2")!.scale.x).toBe(1);
    expect(s.objects.get("unit-3")!.scale.x).toBe(1);
    expect(done).toBe(0);

    // Landed, 0.15 s in: the explosion's three layers, both numbers and
    // both fades, all from the same instant.
    queue.update(0.15);
    expect(named(queue, "vfx.blast")).toEqual([
      "vfx.blast-glow",
      "vfx.blast-ring",
    ]);
    expect(named(queue, "vfx.impact")).toEqual(["vfx.impact"]);
    expect(named(queue, "vfx.floater")).toEqual([
      "vfx.floater:-4",
      "vfx.floater:-7",
    ]);
    const two = s.objects.get("unit-2")!.scale.x;
    const three = s.objects.get("unit-3")!.scale.x;
    expect(two).toBeLessThan(1);
    expect(two).toBeGreaterThan(0.05);
    expect(three).toBe(two);
    expect(done).toBe(0);

    queue.update(1);
    expect(done).toBe(1);
    expect(queue.busy).toBe(false);
    expect(queue.root.children).toHaveLength(0);
    expect(s.objects.get("unit-2")!.scale.x).toBeLessThan(0.05);
    expect(s.objects.get("unit-3")!.scale.x).toBeLessThan(0.05);
  });

  it("puts MISS over the tile for a shot at the ground that went wide, and no explosion", () => {
    const s = withThird();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    const wide: TacticalEvent = {
      ...BLAST,
      payload: { ...BLAST.payload, hit: false, aimedAtTile: true, victims: [] },
    };
    queue.enqueue([wide], () => undefined);
    queue.update(0.05);
    expect(named(queue, "vfx.floater")).toEqual([]);
    queue.update(0.15);
    expect(named(queue, "vfx.floater")).toEqual(["vfx.floater:MISS"]);
    expect(named(queue, "vfx.blast")).toEqual([]);
    expect(named(queue, "vfx.impact")).toEqual([]);
  });

  it("bursts a spawner the blast finished with the explosion, not before it", () => {
    const s = withThird();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    const egg: TacticalEvent = {
      type: "tactical:spawner-damaged",
      payload: {
        spawnerId: "spawner-1",
        unitId: "unit-1",
        damage: 20,
        hp: 0,
        destroyed: true,
      },
    };
    const shell: TacticalEvent = {
      ...BLAST,
      payload: {
        ...BLAST.payload,
        aimedAtTile: true,
        victims: [
          { targetId: "spawner-1", kind: "spawner", damage: 20, hp: 0 },
        ],
      },
    };
    queue.enqueue([egg, shell], () => undefined);
    queue.update(0.05);
    expect(named(queue, "vfx.egg-burst")).toEqual([]);
    queue.update(0.15);
    expect(named(queue, "vfx.egg-burst")).toEqual(["vfx.egg-burst"]);
    expect(named(queue, "vfx.floater")).toEqual(["vfx.floater:-20"]);
  });

  it("leaves a shot that is not a blast's alone, even when another unit's blast follows", () => {
    const s = withThird();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    const someoneElse: TacticalEvent = {
      ...BLAST,
      payload: { ...BLAST.payload, attackerId: "unit-3", victims: [] },
    };
    queue.enqueue([ATTACK, DEATH, someoneElse], () => undefined);
    queue.update(0.05);
    // A plain attack raises its number hidden as it starts — four
    // billboards, as it always has — rather than waiting for a landing.
    expect(queue.root.children).toHaveLength(4);
    expect(named(queue, "vfx.floater")).toEqual(["vfx.floater:-7"]);
    expect(named(queue, "vfx.blast")).toEqual([]);
  });

  it("floats a green +N over every unit a kit mended, and nothing else (#1138)", () => {
    const s = withThird();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    const healed: TacticalEvent = {
      type: "tactical:units-healed",
      payload: {
        kitId: "medkit",
        userId: "unit-1",
        healed: [
          { unitId: "unit-2", amount: 10, hpAfter: 20 },
          { unitId: "unit-3", amount: 4, hpAfter: 20 },
          // A unit the scene does not have gets no number, and the rest still do.
          { unitId: "unit-9", amount: 1, hpAfter: 20 },
        ],
      },
    };
    let done = 0;
    queue.enqueue([healed], () => {
      done++;
    });
    queue.update(0.05);
    expect(named(queue, "vfx.floater")).toEqual([
      "vfx.floater:+10",
      "vfx.floater:+4",
    ]);
    expect(named(queue, "vfx.blast")).toEqual([]);
    expect(queue.root.children).toHaveLength(2);
    queue.update(0.3);
    expect(done).toBe(1);
    expect(queue.root.children).toHaveLength(0);
  });

  it("draws a continuous beam without an explosion and disposes it when skipped", () => {
    const queue = new TacticalAnimationQueue({
      scene: scene(),
      sprites,
      timing: TIMING,
    });
    queue.enqueue(
      [
        {
          ...BLAST,
          payload: { ...BLAST.payload, beam: true, radius: 0, victims: [] },
        },
      ],
      () => undefined,
    );
    queue.update(0.05);
    expect(named(queue, "vfx.mech-beam")).toEqual(["vfx.mech-beam"]);
    expect(named(queue, "vfx.blast")).toEqual([]);
    queue.skip();
    expect(queue.root.children).toHaveLength(0);
  });

  it("smoke lands without explosive effects or damage numbers", () => {
    const queue = new TacticalAnimationQueue({
      scene: scene(),
      sprites,
      timing: TIMING,
    });
    queue.enqueue(
      [
        {
          ...BLAST,
          payload: {
            ...BLAST.payload,
            smoke: true,
            aimedAtTile: true,
            victims: [],
          },
        },
      ],
      () => undefined,
    );
    queue.update(0.16);
    expect(named(queue, "vfx.blast")).toEqual([]);
    expect(queue.root.children).toHaveLength(0);
    expect(queue.busy).toBe(false);
  });

  it("finishes a blast whole when skipped or played instantly", () => {
    const s = withThird();
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    let done = 0;
    queue.enqueue([ATTACK, DEATH, DEATH_3, BLAST], () => {
      done++;
    });
    queue.update(0.05);
    queue.skip();
    expect(done).toBe(1);
    expect(queue.busy).toBe(false);
    expect(queue.root.children).toHaveLength(0);
    expect(s.objects.get("unit-2")!.scale.x).toBeLessThan(0.05);
    expect(s.objects.get("unit-3")!.scale.x).toBeLessThan(0.05);

    const instantScene = withThird();
    const instant = new TacticalAnimationQueue({
      scene: instantScene,
      sprites,
      timing: TIMING,
      instant: true,
    });
    const started: string[] = [];
    let instantDone = 0;
    instant.enqueue(
      [ATTACK, DEATH, DEATH_3, BLAST],
      () => {
        instantDone++;
      },
      (event) => started.push(event.type),
    );
    expect(instantDone).toBe(1);
    expect(started).toHaveLength(4);
    expect(instant.root.children).toHaveLength(0);
    expect(instantScene.objects.get("unit-3")!.scale.x).toBeLessThan(0.05);
  });
});

describe("brace playback", () => {
  it("deploys over time, retracts before moving, and leaves a skipped move stowed", () => {
    const s = scene();
    const motion = {
      braceAmount: 0,
      brace: (amount: number): void => {
        motion.braceAmount = amount;
      },
      walk: vi.fn(),
      attack: vi.fn(),
      reset: vi.fn(),
    };
    s.unitMotion = () => motion;
    const queue = new TacticalAnimationQueue({
      scene: s,
      sprites,
      timing: TIMING,
    });
    const brace: TacticalEvent = {
      type: "tactical:mech-system-used",
      payload: { unitId: "unit-1", action: "brace" },
    };
    queue.enqueue([brace]);
    queue.update(0.175);
    expect(motion.braceAmount).toBeCloseTo(0.5);
    queue.update(0.175);
    expect(motion.braceAmount).toBe(1);
    const start = s.objects.get("unit-1")!.position.clone();
    queue.enqueue([MOVE]);
    queue.update(0.175);
    expect(motion.braceAmount).toBeCloseTo(0.5);
    expect(s.objects.get("unit-1")!.position).toEqual(start);
    expect(motion.walk).not.toHaveBeenCalled();
    queue.update(0.2);
    expect(motion.braceAmount).toBe(0);
    expect(motion.walk).toHaveBeenCalled();
    queue.skip();
    expect(s.objects.get("unit-1")!.position.x).toBeCloseTo(
      tileTopCentre(MOVE.payload.to).x,
    );
    queue.enqueue([brace]);
    queue.skip();
    expect(motion.braceAmount).toBe(1);
    queue.enqueue([MOVE]);
    queue.skip();
    expect(motion.braceAmount).toBe(0);
  });
});

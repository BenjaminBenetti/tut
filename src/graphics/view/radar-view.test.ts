import { Group, Mesh, MeshBasicMaterial, Sprite } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Radar } from "../../tactical/model/radar";
import {
  HEAD_TURN_RATE,
  RADAR_HEAD_NAME,
  RADAR_SMOKE_NAME,
  RadarView,
} from "./radar-view";

const RADAR: Radar = {
  id: "radar-1",
  team: "tdf",
  pos: { x: 2, y: 0, z: 3 },
  range: 30,
  turnsLeft: 3,
};

/** A stand-in for the scanner GLB: the head nodes the real one exports, plus a mast that stays put. */
function scannerModel(): Group {
  const model = new Group();
  for (const name of ["mast", "dish", "dish_face", "feed_arm", "feed"]) {
    const part = new Group();
    part.name = name;
    part.position.set(0, 0.7, name === "feed" ? 0.28 : 0);
    model.add(part);
  }
  return model;
}

describe("RadarView", () => {
  it("draws red intel above fog and roofs and removes stale contacts", async () => {
    const view = new RadarView({
      load: () => Promise.resolve(new Group()),
      preload: () => Promise.resolve(),
    });
    await view.updateRadar(
      [RADAR],
      [
        { kind: "unit", pos: { x: 9, y: 0, z: 3 } },
        { kind: "structure", pos: { x: 10, y: 2, z: 4 } },
      ],
    );
    expect(view.counts()).toEqual({ scanners: 1, contacts: 2 });
    expect(view.root.getObjectByName("radar-1")?.position.x).toBe(2.5);
    const contacts = view.root.getObjectByName("radar-contacts")!;
    contacts.traverse((object) => {
      if (
        !(object instanceof Mesh) ||
        !(object.material instanceof MeshBasicMaterial)
      )
        return;
      expect(object.material.depthTest).toBe(false);
      expect(object.material.depthWrite).toBe(false);
      expect(object.material.color.getHex()).toBe(0xe0453c);
      expect(object.renderOrder).toBeGreaterThan(5);
    });
    await view.updateRadar([RADAR], []);
    expect(view.counts()).toEqual({ scanners: 1, contacts: 0 });
    view.dispose();
    expect(view.root.children).toHaveLength(0);
  });

  it("does not resurrect a scanner when a model load finishes after disposal", async () => {
    let finish!: (object: Group) => void;
    const load = vi.fn(
      () =>
        new Promise<Group>((resolve) => {
          finish = resolve;
        }),
    );
    const view = new RadarView({ load, preload: () => Promise.resolve() });
    const pending = view.updateRadar([RADAR], []);
    view.dispose();
    finish(new Group());
    await pending;
    expect(view.counts()).toEqual({ scanners: 0, contacts: 0 });
    expect(view.root.children).toHaveLength(0);
  });

  it("turns the dish head slowly while the battery holds, on the frame clock (#1130)", async () => {
    const view = new RadarView({
      load: () => Promise.resolve(scannerModel()),
      preload: () => Promise.resolve(),
    });
    await view.updateRadar([RADAR], []);
    const model = view.root.getObjectByName("radar-1")!;
    const head = model.getObjectByName(RADAR_HEAD_NAME)!;
    expect(head.children.map((part) => part.name).sort()).toEqual(
      ["dish", "dish_face", "feed", "feed_arm"].sort(),
    );
    expect(model.getObjectByName("mast")?.parent).toBe(model);
    // Reparenting kept the feed where the GLB put it.
    expect(model.getObjectByName("feed")?.position.z).toBeCloseTo(0.28);
    expect(head.rotation.y).toBe(0);
    view.update(0.5);
    expect(head.rotation.y).toBeCloseTo(HEAD_TURN_RATE * 0.5);
    view.update(0.5);
    expect(head.rotation.y).toBeCloseTo(HEAD_TURN_RATE);
    // One revolution every twenty seconds: the constant is not a mystery number.
    expect(HEAD_TURN_RATE * 20).toBeCloseTo(2 * Math.PI);
    expect(model.getObjectByName(RADAR_SMOKE_NAME)).toBeUndefined();
    view.dispose();
  });

  it("stops the head and smokes once the battery is dead, on the next update from state", async () => {
    const view = new RadarView({
      load: () => Promise.resolve(scannerModel()),
      preload: () => Promise.resolve(),
    });
    await view.updateRadar([RADAR], []);
    view.update(1);
    const model = view.root.getObjectByName("radar-1")!;
    const head = model.getObjectByName(RADAR_HEAD_NAME)!;
    const turned = head.rotation.y;
    expect(turned).toBeGreaterThan(0);
    await view.updateRadar([{ ...RADAR, turnsLeft: 0 }], []);
    expect(view.counts()).toEqual({ scanners: 1, contacts: 0 });
    const smoke = model.getObjectByName(RADAR_SMOKE_NAME)!;
    const puffs = smoke.children.filter(
      (c): c is Sprite => c instanceof Sprite,
    );
    expect(puffs.length).toBeGreaterThan(0);
    view.update(1);
    expect(head.rotation.y).toBe(turned);
    for (const puff of puffs) {
      expect(puff.position.y).toBeGreaterThan(0.7);
      expect(puff.material.opacity).toBeGreaterThanOrEqual(0);
      expect(puff.material.opacity).toBeLessThan(1);
      expect(puff.material.color.getHex()).toBe(0x2f2f2f);
      expect(puff.material.depthWrite).toBe(false);
    }
    // The plume rises: puffs are spread over the loop, so at least one is above where it was born.
    expect(Math.max(...puffs.map((p) => p.position.y))).toBeGreaterThan(0.9);
    // Dead is dead: a later update from state builds no second plume.
    await view.updateRadar([{ ...RADAR, turnsLeft: 0 }], []);
    expect(
      model.children.filter((c) => c.name === RADAR_SMOKE_NAME),
    ).toHaveLength(1);
    view.dispose();
    expect(view.root.children).toHaveLength(0);
  });

  it("shows a scanner from a resumed save dead from its first frame", async () => {
    const view = new RadarView({
      load: () => Promise.resolve(scannerModel()),
      preload: () => Promise.resolve(),
    });
    await view.updateRadar([{ ...RADAR, turnsLeft: 0 }], []);
    const model = view.root.getObjectByName("radar-1")!;
    expect(model.getObjectByName(RADAR_SMOKE_NAME)).toBeDefined();
    view.update(2);
    expect(model.getObjectByName(RADAR_HEAD_NAME)?.rotation.y).toBe(0);
    view.dispose();
  });

  it("turns a placeholder model without head nodes as a whole", async () => {
    const view = new RadarView({
      load: () => Promise.resolve(new Group()),
      preload: () => Promise.resolve(),
    });
    await view.updateRadar([RADAR], []);
    view.update(1);
    expect(view.root.getObjectByName("radar-1")?.rotation.y).toBeCloseTo(
      HEAD_TURN_RATE,
    );
    view.dispose();
  });
});

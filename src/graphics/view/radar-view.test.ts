import { Group, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Radar } from "../../tactical/model/radar";
import { RadarView } from "./radar-view";

const RADAR: Radar = {
  id: "radar-1",
  team: "tdf",
  pos: { x: 2, y: 0, z: 3 },
  range: 30,
};

describe("RadarView", () => {
  it("draws red intel above fog and roofs and removes stale contacts", async () => {
    const view = new RadarView({
      load: () => Promise.resolve(new Group()),
      preload: () => Promise.resolve(),
    });
    await view.update(
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
    await view.update([RADAR], []);
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
    const pending = view.update([RADAR], []);
    view.dispose();
    finish(new Group());
    await pending;
    expect(view.counts()).toEqual({ scanners: 0, contacts: 0 });
    expect(view.root.children).toHaveLength(0);
  });
});

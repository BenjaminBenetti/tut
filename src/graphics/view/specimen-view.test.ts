import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { SpecimenPlacement } from "./specimen-view";
import {
  SPECIMEN_NET_NAME,
  SPECIMEN_SCALE,
  SPECIMEN_TINT,
  SpecimenView,
} from "./specimen-view";

// ===========================================
// Fixtures
// ===========================================

const LURKER: ModelAssetId = "bug.lurker";

/** A dropped lurker named by its fallen carrier, lying at (x, z). */
function dropped(id: string, x: number, z: number): SpecimenPlacement {
  return { id, pos: { x, y: 0, z }, modelId: LURKER };
}

/** The material every stand-in lurker shares, as the loader's prototype's would be. */
const SHARED = new MeshStandardMaterial({ color: 0xffffff });

/** A stand-in lurker model: one white box, a unit a side, on the shared material. */
function lurkerModel(): Group {
  const model = new Group();
  const body = new Mesh(new BoxGeometry(1, 1, 1), SHARED);
  body.name = "body";
  model.add(body);
  return model;
}

/** A loader that hands out stand-in lurkers and records what it was asked for. */
function loader() {
  const load = vi.fn((_id: ModelAssetId) => Promise.resolve(lurkerModel()));
  return { load, preload: () => Promise.resolve() };
}

// ===========================================
// Tests
// ===========================================

describe("SpecimenView (#1179)", () => {
  it("lays each dropped specimen on its tile as its species' model, scaled down, tinted, under a net", async () => {
    const models = loader();
    const view = new SpecimenView(models);
    await view.updateSpecimens([dropped("squad-1", 2, 3)]);
    expect(view.ids()).toEqual(["squad-1"]);
    expect(models.load).toHaveBeenCalledWith(LURKER);

    const specimen = view.root.getObjectByName("specimen:squad-1")!;
    expect(specimen.position.x).toBe(2.5);
    expect(specimen.position.z).toBe(3.5);
    const body = specimen.getObjectByName("body") as Mesh;
    expect(body.parent!.scale.x).toBeCloseTo(SPECIMEN_SCALE);
    // Its own tinted copy: the free lurkers' shared material is untouched.
    const material = body.material as MeshStandardMaterial;
    expect(material).not.toBe(SHARED);
    expect(material.color.getHex()).toBe(SPECIMEN_TINT);
    expect(SHARED.color.getHex()).toBe(0xffffff);
    // The net covers the bundled bug: wider than it is, as tall as it.
    const net = specimen.getObjectByName(SPECIMEN_NET_NAME) as Mesh;
    expect(net).toBeInstanceOf(Mesh);
    expect(net.scale.x).toBeGreaterThan(SPECIMEN_SCALE);
  });

  it("removes a specimen once it is picked up, and frees the tinted copy it owned", async () => {
    const view = new SpecimenView(loader());
    await view.updateSpecimens([
      dropped("squad-1", 2, 3),
      dropped("squad-2", 5, 5),
    ]);
    const body = view.root
      .getObjectByName("specimen:squad-1")!
      .getObjectByName("body") as Mesh;
    const disposed = vi.fn();
    (body.material as MeshStandardMaterial).addEventListener(
      "dispose",
      disposed,
    );

    await view.updateSpecimens([dropped("squad-2", 5, 5)]);
    expect(view.ids()).toEqual(["squad-2"]);
    expect(view.root.getObjectByName("specimen:squad-1")).toBeUndefined();
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it("does not lay a specimen whose load finishes after it was picked up", async () => {
    let finish!: (model: Group) => void;
    const view = new SpecimenView({
      load: () =>
        new Promise<Group>((resolve) => {
          finish = resolve;
        }),
      preload: () => Promise.resolve(),
    });
    const pending = view.updateSpecimens([dropped("squad-1", 2, 3)]);
    await view.updateSpecimens([]);
    finish(lurkerModel());
    await pending;
    expect(view.ids()).toEqual([]);
    expect(view.root.children).toHaveLength(0);
  });

  it("loads a specimen once however often the scene is redrawn", async () => {
    const models = loader();
    const view = new SpecimenView(models);
    await view.updateSpecimens([dropped("squad-1", 2, 3)]);
    await view.updateSpecimens([dropped("squad-1", 2, 3)]);
    expect(models.load).toHaveBeenCalledTimes(1);
    expect(view.root.children).toHaveLength(1);
    view.dispose();
    expect(view.root.children).toHaveLength(0);
  });
});

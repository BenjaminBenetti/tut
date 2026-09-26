import type { Object3D } from "three";
import {
  Box3,
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";

import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import type { MechWreck } from "../../tactical/model/mech-wreck";
import type { MechAssembly } from "../data/part-model-table";
import { mechAssemblyFor } from "../data/part-model-table";
import type { FrameUpdatable } from "../model/frame-updatable";
import { unitFeetAt } from "../service/unit-placement";
import {
  WRECK_NAME_PREFIX,
  WRECK_SINK,
  WRECK_TINT,
  WreckView,
} from "./wreck-view";

// ===========================================
// Fixtures
// ===========================================

/** Standing height of the stand-in mech, as tall as the real one. */
const MECH_HEIGHT = 2.8;

/** The colour every stand-in part is authored in; shared, as the loader shares it. */
const SHARED = new MeshStandardMaterial({
  color: new Color(0.8, 0.6, 0.4),
  emissive: new Color(1, 0.5, 0),
});

/**
 * Stands in for the mech assembler: records what it was asked to build,
 * returns a tall box with its pivot at the feet on the shared material,
 * and lets a test hold a build open.
 */
class FakeAssembler {
  readonly built: MechAssembly[] = [];
  private gate: Promise<void> = Promise.resolve();
  private release: (() => void) | undefined;

  /** Holds every build until `open`. */
  hold(): void {
    this.gate = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  /** Lets held builds finish. */
  open(): void {
    this.release?.();
  }

  /** A standing mech: 0.8 wide, MECH_HEIGHT tall, feet at the origin. */
  async assemble(assembly: MechAssembly): Promise<Object3D> {
    this.built.push(assembly);
    await this.gate;
    const root = new Group();
    const body = new Mesh(new BoxGeometry(0.8, MECH_HEIGHT, 0.8), SHARED);
    body.position.y = MECH_HEIGHT / 2;
    root.add(body);
    return root;
  }
}

/** A wreck over the 3 × 3 square with its corner at (x, z), on level `y`. */
function wreckAt(id: string, x: number, z: number, y = 0): MechWreck {
  const tiles = [z, z + 1, z + 2].flatMap((tz) =>
    [x, x + 1, x + 2].map((tx) => ({ x: tx, y, z: tz })),
  );
  return {
    id,
    pos: { x: x + 1, y, z: z + 1 },
    tiles,
    mechName: "Anvil",
    loadout: {
      ...STARTER_LOADOUT,
      utilityIds: ["utility-radiator", "utility-radiator"],
    },
  };
}

/** The first mesh under the wreck's drawn group. */
function meshOf(view: WreckView, id: string): Mesh {
  let found: Mesh | undefined;
  view.wreckObject(id)?.traverse((node) => {
    if (found === undefined && node instanceof Mesh) {
      found = node;
    }
  });
  if (found === undefined) {
    throw new Error(`no mesh drawn for ${id}`);
  }
  return found;
}

// ===========================================
// WreckView
// ===========================================

describe("WreckView (arc §6.6)", () => {
  it("builds each wreck from its own loadout, one named group per wreck", async () => {
    const assembler = new FakeAssembler();
    const view = new WreckView(assembler);
    const first = wreckAt("wreck-1", 2, 2);
    await view.updateWrecks([first, wreckAt("wreck-2", 8, 8)]);
    expect(view.wreckIds()).toEqual(["wreck-1", "wreck-2"]);
    expect(assembler.built[0]).toEqual(mechAssemblyFor(first.loadout));
    expect(view.root.children.map((child) => child.name)).toEqual([
      `${WRECK_NAME_PREFIX}wreck-1`,
      `${WRECK_NAME_PREFIX}wreck-2`,
    ]);
    // A wreck never moves, so a second update builds nothing new.
    await view.updateWrecks([first, wreckAt("wreck-2", 8, 8)]);
    expect(assembler.built).toHaveLength(2);
  });

  it("lays the mech down across its middle tile, sunk a little into the ground", async () => {
    const view = new WreckView(new FakeAssembler());
    const wreck = wreckAt("wreck-1", 4, 6, 2);
    await view.updateWrecks([wreck]);
    const drawn = view.wreckObject(wreck.id);
    expect(drawn).toBeDefined();
    drawn?.updateMatrixWorld(true);
    const box = new Box3().setFromObject(drawn ?? new Group());
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const feet = unitFeetAt(wreck.pos, 1);
    // Lying, not standing: well under its standing height (its width
    // now stands up, propped on a shoulder), and longer across the
    // ground than it is tall.
    expect(size.y).toBeLessThan(MECH_HEIGHT * 0.6);
    expect(Math.hypot(size.x, size.z)).toBeGreaterThan(size.y);
    // Centred over the middle tile, bottom just under that tile's top.
    expect(centre.x).toBeCloseTo(feet.x, 5);
    expect(centre.z).toBeCloseTo(feet.z, 5);
    expect(box.min.y).toBeCloseTo(feet.y - WRECK_SINK, 5);
    // It fits the hook: nothing overhangs the 3 × 3 square.
    expect(box.min.x).toBeGreaterThanOrEqual(wreck.tiles[0]?.x ?? 0);
    expect(box.max.x).toBeLessThanOrEqual((wreck.tiles[0]?.x ?? 0) + 3);
    expect(box.min.z).toBeGreaterThanOrEqual(wreck.tiles[0]?.z ?? 0);
    expect(box.max.z).toBeLessThanOrEqual((wreck.tiles[0]?.z ?? 0) + 3);
  });

  it("darkens its own copies of the materials and puts the lamps out, leaving the shared ones alone", async () => {
    const view = new WreckView(new FakeAssembler());
    await view.updateWrecks([wreckAt("wreck-1", 2, 2)]);
    const material = meshOf(view, "wreck-1").material as MeshStandardMaterial;
    expect(material).not.toBe(SHARED);
    expect(material.color.r).toBeCloseTo(SHARED.color.r * WRECK_TINT, 5);
    expect(material.color.g).toBeCloseTo(SHARED.color.g * WRECK_TINT, 5);
    expect(material.color.b).toBeCloseTo(SHARED.color.b * WRECK_TINT, 5);
    expect(material.emissive.getHex()).toBe(0x000000);
    // Every other mech on the field draws from the shared material.
    expect(SHARED.color.r).toBeCloseTo(0.8, 5);
    expect(SHARED.emissive.getHex()).not.toBe(0x000000);
  });

  it("removes a wreck gone from the list and frees its tinted materials", async () => {
    const view = new WreckView(new FakeAssembler());
    await view.updateWrecks([wreckAt("wreck-1", 2, 2)]);
    const material = meshOf(view, "wreck-1").material as MeshStandardMaterial;
    const freed = vi.spyOn(material, "dispose");
    await view.updateWrecks([]);
    expect(view.wreckIds()).toEqual([]);
    expect(view.root.children).toHaveLength(0);
    expect(freed).toHaveBeenCalled();
  });

  it("drops a build that finishes after its wreck left the list", async () => {
    const assembler = new FakeAssembler();
    const view = new WreckView(assembler);
    assembler.hold();
    const pending = view.updateWrecks([wreckAt("wreck-1", 2, 2)]);
    await view.updateWrecks([]);
    assembler.open();
    await pending;
    expect(view.root.children).toHaveLength(0);
    expect(view.wreckObject("wreck-1")).toBeUndefined();
  });

  it("lies still: nothing for the frame loop to tick", () => {
    const view = new WreckView(new FakeAssembler());
    expect((view as Partial<FrameUpdatable>).update).toBeUndefined();
  });

  it("dispose takes every wreck down and detaches the layer", async () => {
    const parent = new Group();
    const view = new WreckView(new FakeAssembler());
    parent.add(view.root);
    await view.updateWrecks([wreckAt("wreck-1", 2, 2)]);
    view.dispose();
    expect(view.wreckIds()).toEqual([]);
    expect(view.root.children).toHaveLength(0);
    expect(view.root.parent).toBeNull();
  });
});

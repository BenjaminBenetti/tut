import type { Object3D } from "three";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { describe, expect, it } from "vitest";

import type { Deployable } from "../../overworld/model/deployable";
import { DEPLOYABLE_ANIMATIONS } from "../data/deployable-animations";
import { DEPLOYABLE_ANIMATED_NODE } from "../data/overworld-model-table";
import type { ModelLoader } from "../model/model-loader";
import type { InstallationLook } from "./installation-marker";
import {
  INSTALLATION_HOVER_SCALE,
  INSTALLATION_STAND_IN_HEIGHT,
  InstallationMarker,
  OFFLINE_DIM,
  OFFLINE_OPACITY,
  yawAt,
} from "./installation-marker";

// ===========================================
// Fixtures
// ===========================================

const AT = { x: 3, y: 0.05, z: 4 };

function deployable(overrides: Partial<Deployable> = {}): Deployable {
  return {
    id: "deployable-1",
    typeId: "sensor-array",
    regionId: "east-asia",
    level: 1,
    builtDay: 1,
    online: true,
    ...overrides,
  };
}

/** A stand-in for a deployable GLB: a shaded base with an `animated` child, like the real export. */
function deployableModel(): Group {
  const model = new Group();
  model.name = "overworld.deployable.sensor-array";
  const base = new Mesh(
    new BoxGeometry(0.4, 0.2, 0.4),
    new MeshStandardMaterial({ color: 0x808080 }),
  );
  base.name = "base";
  const animated = new Mesh(
    new BoxGeometry(0.2, 0.1, 0.2),
    new MeshStandardMaterial({ color: 0x4080ff }),
  );
  animated.name = DEPLOYABLE_ANIMATED_NODE;
  base.add(animated);
  model.add(base);
  return model;
}

/** The materials shared by every clone: what a marker must not touch. */
const PROTOTYPE = deployableModel();

function loader(
  model: () => Object3D = () => PROTOTYPE.clone(true),
): ModelLoader {
  return {
    load: () => Promise.resolve(model()),
    preload: () => Promise.resolve(),
  };
}

function look(
  models: ModelLoader | undefined,
  extra: Partial<InstallationLook> = {},
): InstallationLook {
  return {
    ...extra,
    models,
    animations: DEPLOYABLE_ANIMATIONS,
    falloff: new Texture(),
    standIn: new BoxGeometry(0.45, INSTALLATION_STAND_IN_HEIGHT, 0.45),
    pick: new BoxGeometry(0.45, 0.4, 0.45),
    footprint: 0.45,
  };
}

/** Lets every pending model load land. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function materialsUnder(root: Object3D): MeshStandardMaterial[] {
  const found: MeshStandardMaterial[] = [];
  root.traverse((node) => {
    if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) {
      found.push(node.material);
    }
  });
  return found;
}

// ===========================================
// Tests
// ===========================================

describe("yawAt", () => {
  it("spins linearly and sweeps on a sine", () => {
    expect(yawAt({ kind: "spin", radiansPerSecond: 1 }, 2)).toBeCloseTo(2, 6);
    expect(
      yawAt({ kind: "spin", radiansPerSecond: 1 }, 2 * Math.PI + 1),
    ).toBeCloseTo(1, 6);
    const sweep = { kind: "sweep", arc: 0.5, phaseRate: Math.PI / 2 } as const;
    expect(yawAt(sweep, 0)).toBeCloseTo(0, 6);
    expect(yawAt(sweep, 1)).toBeCloseTo(0.5, 6);
    expect(yawAt(sweep, 3)).toBeCloseTo(-0.5, 6);
  });
});

describe("InstallationMarker (#1155)", () => {
  it("stands the type's model at its slot and turns the animated node every frame", async () => {
    const marker = new InstallationMarker(deployable(), AT, look(loader()));
    expect(marker.object.name).toBe("installation-deployable-1");
    expect(marker.object.position.toArray()).toEqual([3, 0.05, 4]);
    expect(marker.look().model).toBe("loading");
    await settled();
    expect(marker.look()).toMatchObject({
      typeId: "sensor-array",
      online: true,
      model: "glb",
      animatedYaw: 0,
      spraying: false,
    });
    // A quarter of the dish's twelve-second turn.
    marker.update(3);
    expect(marker.look().animatedYaw).toBeCloseTo(Math.PI / 2, 6);
    marker.moveTo({ x: 5, y: 0.05, z: 6 });
    expect(marker.object.position.x).toBe(5);
  });

  it("dims an offline installation on copies of the materials, leaving the loader's alone", async () => {
    const marker = new InstallationMarker(
      deployable({ online: false }),
      AT,
      look(loader()),
    );
    await settled();
    const owned = materialsUnder(marker.object);
    expect(owned).toHaveLength(2);
    const shared = materialsUnder(PROTOTYPE);
    for (const material of owned) {
      expect(shared).not.toContain(material);
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(OFFLINE_OPACITY);
    }
    expect(owned[0]?.color.getHex()).toBe(
      shared[0]?.color.clone().multiplyScalar(OFFLINE_DIM).getHex(),
    );
    expect(shared[0]?.opacity).toBe(1);
    expect(shared[0]?.transparent).toBe(false);

    marker.setOnline(true);
    for (const [index, material] of owned.entries()) {
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.color.getHex()).toBe(shared[index]?.color.getHex());
    }
    expect(marker.look().online).toBe(true);
  });

  it("attaches a spray to the dispersal's nozzle that only shows while online", async () => {
    const marker = new InstallationMarker(
      deployable({ typeId: "repellent-dispersal" }),
      AT,
      look(loader()),
    );
    await settled();
    expect(marker.look().spraying).toBe(true);
    const spray = marker.object.getObjectByName(
      "installation-spray-deployable-1",
    );
    expect(spray?.parent?.name).toBe(DEPLOYABLE_ANIMATED_NODE);
    expect(spray?.visible).toBe(true);
    marker.setOnline(false);
    expect(spray?.visible).toBe(false);
    // The nozzle sweeps rather than spins: a quarter period is the end of the arc.
    marker.update(2);
    const sweep = DEPLOYABLE_ANIMATIONS["repellent-dispersal"];
    if (sweep.kind !== "sweep") throw new Error("dispersal must sweep");
    expect(marker.look().animatedYaw).toBeCloseTo(sweep.arc, 6);
  });

  it("stands still on a placeholder box, which has nothing to turn", async () => {
    const marker = new InstallationMarker(
      deployable({ typeId: "defensive-battery" }),
      AT,
      look(
        loader(() => {
          const box = new Group();
          box.name = "placeholder:overworld.deployable.defensive-battery";
          return box;
        }),
      ),
    );
    await settled();
    expect(marker.look()).toMatchObject({
      model: "placeholder",
      animatedYaw: undefined,
      spraying: false,
    });
    marker.update(1);
    expect(marker.look().animatedYaw).toBeUndefined();
  });

  it("draws a stand-in block without a loader and dims that too", () => {
    const marker = new InstallationMarker(
      deployable({ online: false }),
      AT,
      look(undefined),
    );
    expect(marker.look().model).toBe("stand-in");
    const block = marker.object.getObjectByName(
      "installation-stand-in-deployable-1",
    ) as Mesh;
    expect(block).toBeInstanceOf(Mesh);
    expect((block.material as MeshStandardMaterial).opacity).toBe(
      OFFLINE_OPACITY,
    );
  });

  it("carries a hidden pick solid, and shows the type's name while hovered or selected (#1155)", async () => {
    const label = new Texture();
    const asked: string[] = [];
    const marker = new InstallationMarker(
      deployable(),
      AT,
      look(loader(), {
        text: {
          textTexture: (text) => {
            asked.push(text);
            return label;
          },
        },
        nameOf: () => "Sensor array",
      }),
    );
    await settled();
    expect(asked).toEqual(["Sensor array"]);
    expect(marker.pickTarget.visible).toBe(false);
    expect(marker.pickTarget.parent).toBe(marker.object);
    const sprite = marker.object.getObjectByName(
      "installation-label-deployable-1",
    );
    expect(sprite?.visible).toBe(false);
    expect(marker.look().labelVisible).toBe(false);
    marker.setHovered(true);
    expect(sprite?.visible).toBe(true);
    expect(
      marker.object.getObjectByName("installation-visual-deployable-1")?.scale
        .x,
    ).toBe(INSTALLATION_HOVER_SCALE);
    marker.setHovered(false);
    expect(sprite?.visible).toBe(false);
    marker.setSelected(true);
    expect(marker.look().labelVisible).toBe(true);
    // The model stands in the visual group, so growing it leaves the pick solid alone.
    expect(marker.pickTarget.scale.x).toBe(1);
    marker.dispose();
    expect(marker.object.children).toHaveLength(0);
  });

  it("labels with the type id when nothing names the types, and draws no label without a text source", () => {
    const asked: string[] = [];
    new InstallationMarker(
      deployable(),
      AT,
      look(undefined, {
        text: {
          textTexture: (text) => {
            asked.push(text);
            return new Texture();
          },
        },
      }),
    );
    expect(asked).toEqual(["sensor-array"]);
    const bare = new InstallationMarker(deployable(), AT, look(undefined));
    expect(
      bare.object.getObjectByName("installation-label-deployable-1"),
    ).toBeUndefined();
    expect(bare.look().labelVisible).toBe(false);
  });

  it("drops a model that loads after disposal and detaches itself", async () => {
    let finish!: (model: Object3D) => void;
    const marker = new InstallationMarker(
      deployable(),
      AT,
      look({
        load: () =>
          new Promise<Object3D>((resolve) => {
            finish = resolve;
          }),
        preload: () => Promise.resolve(),
      }),
    );
    const parent = new Group();
    parent.add(marker.object);
    marker.dispose();
    finish(deployableModel());
    await settled();
    expect(marker.object.children).toHaveLength(0);
    expect(marker.object.parent).toBeNull();
    expect(parent.children).toHaveLength(0);
  });
});

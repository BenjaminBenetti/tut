import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import type { Deployable } from "../../overworld/model/deployable";
import { DEPLOYABLE_ANIMATIONS } from "../data/deployable-animations";
import { DEPLOYABLE_ANIMATED_NODE } from "../data/overworld-model-table";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import { layoutToWorld } from "../service/overworld-layout";
import type { InstallationLook } from "./installation-marker";
import {
  INSTALLATIONS_NAME,
  RegionInstallations,
} from "./region-installations";

// ===========================================
// Fixtures
// ===========================================

function deployable(
  id: string,
  overrides: Partial<Deployable> = {},
): Deployable {
  return {
    id,
    typeId: "sensor-array",
    regionId: "east-asia",
    level: 1,
    builtDay: 1,
    online: true,
    ...overrides,
  };
}

/** A stand-in for a deployable GLB with the `animated` child the real export has. */
function model(): Group {
  const root = new Group();
  const base = new Mesh(
    new BoxGeometry(0.4, 0.2, 0.4),
    new MeshStandardMaterial(),
  );
  const animated = new Group();
  animated.name = DEPLOYABLE_ANIMATED_NODE;
  base.add(animated);
  root.add(base);
  return root;
}

function look(): InstallationLook {
  return {
    models: {
      load: () => Promise.resolve(model()),
      preload: () => Promise.resolve(),
    },
    animations: DEPLOYABLE_ANIMATIONS,
    falloff: new Texture(),
    standIn: new BoxGeometry(0.45, 0.29, 0.45),
  };
}

function view(): RegionInstallations {
  const installations = new RegionInstallations(look(), OVERWORLD_SCENE_CONFIG);
  installations.setMap(EARTH_MAP);
  return installations;
}

/** Lets every pending model load land. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function distance(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// ===========================================
// Tests
// ===========================================

describe("RegionInstallations (#1155)", () => {
  it("places each installation near its region's anchor, clear of every city, and removes gone ones", () => {
    const installations = view();
    expect(installations.root.name).toBe(INSTALLATIONS_NAME);
    installations.sync([
      deployable("deployable-1"),
      deployable("deployable-2", { typeId: "defensive-battery" }),
      deployable("deployable-3", { regionId: "oceania" }),
    ]);
    expect(installations.ids().sort()).toEqual([
      "deployable-1",
      "deployable-2",
      "deployable-3",
    ]);
    const eastAsia = EARTH_MAP.regions.find(
      (region) => region.id === "east-asia",
    );
    if (!eastAsia) throw new Error("fixture has no east-asia");
    const anchor = layoutToWorld(eastAsia.layout, OVERWORLD_SCENE_CONFIG);
    for (const id of ["deployable-1", "deployable-2"]) {
      const at = installations.worldPosition(id);
      if (!at) throw new Error(`no position for ${id}`);
      expect(at.y).toBe(OVERWORLD_SCENE_CONFIG.markerLift);
      expect(distance(at, anchor)).toBeLessThanOrEqual(
        OVERWORLD_SCENE_CONFIG.installationRingRadius * 1.6 ** 3 + 1e-6,
      );
      for (const city of EARTH_MAP.cities) {
        const world = layoutToWorld(city.layout, OVERWORLD_SCENE_CONFIG);
        expect(distance(at, world)).toBeGreaterThanOrEqual(
          OVERWORLD_SCENE_CONFIG.installationClearance - 1e-6,
        );
      }
    }
    const first = installations.worldPosition("deployable-1");
    const second = installations.worldPosition("deployable-2");
    if (!first || !second) throw new Error("missing positions");
    expect(distance(first, second)).toBeGreaterThanOrEqual(
      OVERWORLD_SCENE_CONFIG.installationClearance - 1e-6,
    );

    installations.sync([
      deployable("deployable-2", { typeId: "defensive-battery" }),
    ]);
    expect(installations.ids()).toEqual(["deployable-2"]);
    expect(installations.root.children).toHaveLength(1);
    expect(installations.look("deployable-1")).toBeUndefined();
  });

  it("lays the same state out the same way, and moves a survivor into the ranks", () => {
    const a = view();
    const b = view();
    const state = [deployable("deployable-1"), deployable("deployable-2")];
    a.sync(state);
    b.sync([...state].reverse());
    expect(a.worldPosition("deployable-1")).toEqual(
      b.worldPosition("deployable-1"),
    );
    expect(a.worldPosition("deployable-2")).toEqual(
      b.worldPosition("deployable-2"),
    );

    a.sync([deployable("deployable-2")]);
    // Alone, the second takes the first slot.
    expect(a.worldPosition("deployable-2")).toEqual(
      b.worldPosition("deployable-1"),
    );
  });

  it("dims an installation that goes offline and ticks every moving part", async () => {
    const installations = view();
    installations.sync([deployable("deployable-1")]);
    await settled();
    expect(installations.look("deployable-1")?.online).toBe(true);
    installations.sync([deployable("deployable-1", { online: false })]);
    expect(installations.look("deployable-1")?.online).toBe(false);
    installations.update(3);
    expect(installations.look("deployable-1")?.animatedYaw).toBeCloseTo(
      Math.PI / 2,
      6,
    );
  });

  it("skips an installation whose region the map does not know, and empties on dispose", () => {
    const installations = view();
    installations.sync([deployable("deployable-1", { regionId: "atlantis" })]);
    expect(installations.ids()).toEqual([]);
    installations.sync([deployable("deployable-1")]);
    const parent = new Group();
    parent.add(installations.root);
    installations.dispose();
    expect(installations.ids()).toEqual([]);
    expect(installations.root.children).toHaveLength(0);
    expect(parent.children).toHaveLength(0);
  });
});

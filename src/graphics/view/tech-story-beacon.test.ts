import {
  AdditiveBlending,
  Box3,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
} from "three";
import { describe, expect, it } from "vitest";

import { NODE_MODEL_EXTENT } from "../service/tech-node-model-source";
import {
  STORY_BEACON_DIM,
  STORY_BEACON_HEIGHT,
  STORY_BEACON_NAME,
  STORY_GEM_NAME,
  STORY_GEM_RATE,
  TechStoryBeacon,
} from "./tech-story-beacon";

const GOLD = 0xf0c63c;

/** The beacon's light shafts: every mesh but the gem. */
function shaftsOf(beacon: TechStoryBeacon): Mesh[] {
  return beacon.object.children.filter(
    (child): child is Mesh =>
      child instanceof Mesh && child.name !== STORY_GEM_NAME,
  );
}

/** The beacon's gem and its material. */
function gemOf(beacon: TechStoryBeacon): {
  gem: Mesh;
  material: MeshStandardMaterial;
} {
  const gem = beacon.object.getObjectByName(STORY_GEM_NAME);
  if (
    !(gem instanceof Mesh) ||
    !(gem.material instanceof MeshStandardMaterial)
  ) {
    throw new Error("the beacon has no lit gem");
  }
  return { gem, material: gem.material };
}

/** A shaft's single material, which the beacon always gives it. */
function shaftMaterial(shaft: Mesh): MeshBasicMaterial {
  if (!(shaft.material instanceof MeshBasicMaterial)) {
    throw new Error("a shaft is not drawn with the unlit basic material");
  }
  return shaft.material;
}

describe("TechStoryBeacon (#1237)", () => {
  it("stands a shaft from its foot to STORY_BEACON_HEIGHT, four times past the tallest model", () => {
    const beacon = new TechStoryBeacon(GOLD);
    expect(beacon.object.name).toBe(STORY_BEACON_NAME);
    const shafts = shaftsOf(beacon);
    expect(shafts.length).toBeGreaterThanOrEqual(1);
    beacon.object.updateMatrixWorld(true);
    const box = new Box3();
    for (const shaft of shafts) {
      box.expandByObject(shaft);
    }
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(STORY_BEACON_HEIGHT, 5);
    expect(box.max.y).toBeGreaterThanOrEqual(4 * NODE_MODEL_EXTENT);
    // A shaft, not a wall: it stays narrower than a pedestal is wide.
    expect(box.max.x - box.min.x).toBeLessThan(1);
  });

  it("fades every shaft from a lit foot to nothing at the top, never brightening on the way up", () => {
    const beacon = new TechStoryBeacon(GOLD);
    for (const shaft of shaftsOf(beacon)) {
      const colours = shaft.geometry.getAttribute("color");
      const positions = shaft.geometry.getAttribute("position");
      expect(colours.itemSize).toBe(4);
      const byHeight = new Map<number, number>();
      for (let index = 0; index < positions.count; index++) {
        const y = Math.round(positions.getY(index) * 1000) / 1000;
        byHeight.set(y, colours.getW(index));
        // White channels: the material's colour tints the light.
        expect(colours.getX(index)).toBe(1);
      }
      const rows = [...byHeight.entries()].sort((a, b) => a[0] - b[0]);
      const foot = rows[0];
      const top = rows[rows.length - 1];
      expect(foot?.[1]).toBeGreaterThan(0.2);
      expect(top?.[1]).toBe(0);
      for (let row = 1; row < rows.length; row++) {
        expect(rows[row]?.[1]).toBeLessThanOrEqual(rows[row - 1]?.[1] ?? 0);
      }
    }
  });

  it("draws with built-in materials only: additive, depth-free, unshadowed light", () => {
    const beacon = new TechStoryBeacon(GOLD);
    beacon.object.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }
      expect(child.material).not.toBeInstanceOf(ShaderMaterial);
      expect(child.castShadow).toBe(false);
    });
    for (const shaft of shaftsOf(beacon)) {
      const material = shaftMaterial(shaft);
      expect(material.color.getHex()).toBe(GOLD);
      expect(material.vertexColors).toBe(true);
      expect(material.transparent).toBe(true);
      expect(material.blending).toBe(AdditiveBlending);
      expect(material.depthWrite).toBe(false);
    }
    expect(gemOf(beacon).material.emissive.getHex()).toBe(GOLD);
  });

  it("turns the gem at STORY_GEM_RATE", () => {
    const beacon = new TechStoryBeacon(GOLD);
    const { gem } = gemOf(beacon);
    const before = gem.rotation.y;
    beacon.update(0.5);
    expect(gem.rotation.y).toBeCloseTo(before + STORY_GEM_RATE * 0.5, 5);
  });

  it("dims shaft and gem to STORY_BEACON_DIM, and brings them back", () => {
    const beacon = new TechStoryBeacon(GOLD);
    const { material: gem } = gemOf(beacon);
    const glow = gem.emissiveIntensity;
    expect(beacon.isDimmed()).toBe(false);
    for (const shaft of shaftsOf(beacon)) {
      expect(shaftMaterial(shaft).opacity).toBe(1);
    }

    beacon.setDimmed(true);
    expect(beacon.isDimmed()).toBe(true);
    for (const shaft of shaftsOf(beacon)) {
      expect(shaftMaterial(shaft).opacity).toBeCloseTo(STORY_BEACON_DIM, 5);
    }
    expect(gem.emissiveIntensity).toBeCloseTo(glow * STORY_BEACON_DIM, 5);

    beacon.setDimmed(false);
    for (const shaft of shaftsOf(beacon)) {
      expect(shaftMaterial(shaft).opacity).toBe(1);
    }
    expect(gem.emissiveIntensity).toBeCloseTo(glow, 5);
  });
});

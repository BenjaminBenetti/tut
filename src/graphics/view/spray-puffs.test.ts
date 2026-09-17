import { Sprite, Texture } from "three";
import { describe, expect, it } from "vitest";

import type { SprayPuffOptions } from "../model/spray-puff-options";
import { SPRAY_PUFFS_NAME, SprayPuffs } from "./spray-puffs";

const OPTIONS: SprayPuffOptions = {
  puffs: 4,
  colour: 0x9fdcff,
  baseScale: 0.05,
  growth: 0.1,
  mouth: { forward: 0.1, height: 0.15 },
  reach: 0.2,
  period: 2,
  peakOpacity: 0.5,
};

function puffs(spray: SprayPuffs): Sprite[] {
  return spray.root.children.filter(
    (child): child is Sprite => child instanceof Sprite,
  );
}

describe("SprayPuffs (#1155)", () => {
  it("builds one sprite per puff, each on its own phase, drifting along local +z", () => {
    const spray = new SprayPuffs(OPTIONS, new Texture());
    expect(spray.root.name).toBe(SPRAY_PUFFS_NAME);
    const sprites = puffs(spray);
    expect(sprites).toHaveLength(4);
    for (const sprite of sprites) {
      expect(sprite.position.x).toBe(0);
      expect(sprite.position.y).toBe(OPTIONS.mouth.height);
      expect(sprite.position.z).toBeGreaterThanOrEqual(OPTIONS.mouth.forward);
      expect(sprite.position.z).toBeLessThanOrEqual(
        OPTIONS.mouth.forward + OPTIONS.reach,
      );
    }
    // Staggered: the puffs are not all at the mouth.
    const zs = new Set(sprites.map((sprite) => sprite.position.z.toFixed(4)));
    expect(zs.size).toBe(4);
  });

  it("carries a puff out, swells it and fades it over its loop", () => {
    const spray = new SprayPuffs({ ...OPTIONS, puffs: 1 }, new Texture());
    const [sprite] = puffs(spray);
    if (!sprite) throw new Error("no puff");
    const material = sprite.material;
    expect(sprite.position.z).toBeCloseTo(OPTIONS.mouth.forward, 6);
    expect(material.opacity).toBe(0);
    spray.update(1);
    expect(sprite.position.z).toBeCloseTo(
      OPTIONS.mouth.forward + OPTIONS.reach / 2,
      6,
    );
    expect(sprite.scale.x).toBeCloseTo(
      OPTIONS.baseScale + OPTIONS.growth / 2,
      6,
    );
    expect(material.opacity).toBeCloseTo(OPTIONS.peakOpacity / 2, 6);
    spray.update(1);
    expect(sprite.position.z).toBeCloseTo(OPTIONS.mouth.forward, 6);
  });

  it("frees its materials and leaves the falloff texture alone on dispose", () => {
    const falloff = new Texture();
    let disposedFalloff = false;
    falloff.addEventListener("dispose", () => {
      disposedFalloff = true;
    });
    const spray = new SprayPuffs(OPTIONS, falloff);
    const materials = puffs(spray).map((sprite) => sprite.material);
    const disposed: number[] = [];
    materials.forEach((material, index) =>
      material.addEventListener("dispose", () => disposed.push(index)),
    );
    spray.dispose();
    expect(disposed).toEqual([0, 1, 2, 3]);
    expect(disposedFalloff).toBe(false);
    expect(spray.root.children).toHaveLength(0);
  });
});

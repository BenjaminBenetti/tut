import type { Material } from "three";
import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";
import { describe, expect, it, vi } from "vitest";

import { DORMANT_POSE, DORMANT_SHADE, DormantLook } from "./dormant-look";

/** A stand-in bug: a body with a glowing eye, and a two-material shell. */
function bug(): { model: Group; body: Mesh; shell: Mesh } {
  const model = new Group();
  const body = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ color: 0x80a040, emissive: 0x402000 }),
  );
  const shell = new Mesh(new BoxGeometry(1, 1, 1), [
    new MeshBasicMaterial({ color: 0xffffff }),
    new MeshBasicMaterial({ color: 0x204060 }),
  ]);
  model.add(body, shell);
  model.scale.set(2, 2, 2);
  return { model, body, shell };
}

/** A material's colour as a hex number. */
function hexOf(material: Material | Material[]): number {
  return (material as MeshBasicMaterial).color.getHex();
}

describe("DormantLook (#1179)", () => {
  it("curls the model from its footprint scale and dims copies, leaving the shared materials alone", () => {
    const { model, body, shell } = bug();
    const loadedBody = body.material as MeshStandardMaterial;
    const loadedShell = shell.material as Material[];
    const look = new DormantLook(model);

    look.set(true);

    expect(look.dormant).toBe(true);
    expect(model.scale.x).toBeCloseTo(2 * DORMANT_POSE.spread);
    expect(model.scale.y).toBeCloseTo(2 * DORMANT_POSE.height);
    expect(model.scale.z).toBeCloseTo(2 * DORMANT_POSE.spread);
    const dimmed = body.material as MeshStandardMaterial;
    expect(dimmed).not.toBe(loadedBody);
    expect(dimmed.color.getHex()).toBe(
      new Color(0x80a040).multiplyScalar(DORMANT_SHADE).getHex(),
    );
    expect(dimmed.emissive.getHex()).toBe(
      new Color(0x402000).multiplyScalar(DORMANT_SHADE).getHex(),
    );
    expect(Array.isArray(shell.material)).toBe(true);
    expect(hexOf((shell.material as Material[])[0]!)).toBe(
      new Color(0xffffff).multiplyScalar(DORMANT_SHADE).getHex(),
    );
    // The loader's materials, shared with every awake bug, are untouched.
    expect(loadedBody.color.getHex()).toBe(0x80a040);
    expect(loadedBody.emissive.getHex()).toBe(0x402000);
    expect(hexOf(loadedShell[0]!)).toBe(0xffffff);
  });

  it("wakes to exactly the loaded materials and pose, and frees its copies", () => {
    const { model, body, shell } = bug();
    const loadedBody = body.material;
    const loadedShell = shell.material;
    const look = new DormantLook(model);
    look.set(true);
    const copy = body.material as Material;
    const freed = vi.spyOn(copy, "dispose");

    look.set(false);

    expect(look.dormant).toBe(false);
    expect(body.material).toBe(loadedBody);
    expect(shell.material).toBe(loadedShell);
    expect(model.scale.toArray()).toEqual([2, 2, 2]);
    expect(freed).toHaveBeenCalledOnce();
  });

  it("is idempotent: asleep twice is dimmed and curled once", () => {
    const { model, body } = bug();
    const look = new DormantLook(model);
    look.set(true);
    const first = body.material;
    look.set(true);
    expect(body.material).toBe(first);
    expect(model.scale.y).toBeCloseTo(2 * DORMANT_POSE.height);
    look.set(false);
    look.set(false);
    expect(model.scale.y).toBe(2);
  });

  it("dispose frees the copies of a bug that died asleep", () => {
    const { model, body } = bug();
    const look = new DormantLook(model);
    look.set(true);
    const freed = vi.spyOn(body.material as Material, "dispose");
    look.dispose();
    expect(freed).toHaveBeenCalledOnce();
  });
});

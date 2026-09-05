import {
  BoxGeometry,
  DataTexture,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
} from "three";
import { describe, expect, it, vi } from "vitest";

import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { UnexploredFog } from "./unexplored-fog";

/** Finds the level's shared coverage texture on an actual scene mesh. */
function maskOf(group: Group): DataTexture {
  const mesh = group.children[0]?.children[0];
  if (!(mesh instanceof Mesh) || !(mesh.material instanceof ShaderMaterial)) {
    throw new Error("fog was not attached to the level");
  }
  const mask: unknown = mesh.material.uniforms.uMask?.value;
  if (!(mask instanceof DataTexture)) throw new Error("no fog coverage mask");
  return mask;
}

describe("UnexploredFog", () => {
  it("owns surface resources without altering or disposing loader prototypes", () => {
    const map = new FixtureMapBuilder(1, 1, 1).fillGround().build();
    const fog = new UnexploredFog(map);
    const geometry = new BoxGeometry();
    const material = new MeshStandardMaterial();
    const mesh = new InstancedMesh(geometry, material, 1);
    const sourceDisposed = vi.fn();
    const ownedDisposed = vi.fn();
    geometry.addEventListener("dispose", sourceDisposed);
    material.addEventListener("dispose", sourceDisposed);
    fog.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    fog.trackSurface(mesh, [0]);
    expect(mesh.geometry).not.toBe(geometry);
    expect(mesh.material).not.toBe(material);
    expect(geometry.getAttribute("unexploredMist")).toBeUndefined();
    expect(mesh.geometry.getAttribute("unexploredMist").getW(0)).toBe(1);
    mesh.geometry.addEventListener("dispose", ownedDisposed);
    mesh.material.addEventListener("dispose", ownedDisposed);
    fog.dispose();
    expect(ownedDisposed).toHaveBeenCalledTimes(2);
    expect(sourceDisposed).not.toHaveBeenCalled();
    geometry.dispose();
    material.dispose();
    mesh.dispose();
  });

  it("clears visible and remembered tiles, preserves sparse upper floors, and resets between views", () => {
    const map = new FixtureMapBuilder(3, 1, 2)
      .fillGround()
      .tile({ x: 1, y: 1, z: 0 }, "roof")
      .build();
    const index = new TileIndex(map);
    const groups = [new Group(), new Group()];
    const fog = new UnexploredFog(map);
    fog.attachTo((level) => groups[level]!);
    const ground = maskOf(groups[0]!);
    const roof = maskOf(groups[1]!);
    expect(groups[0]!.children[0]?.visible).toBe(false);

    // Tile 0 is visible, tile 1 remembered, tile 2 never explored.
    // The roof above remembered ground has its own exploration history.
    const known = [
      index.keyOf({ x: 0, y: 0, z: 0 }),
      index.keyOf({ x: 1, y: 0, z: 0 }),
    ];
    fog.setVision({
      visible: [known[0]!],
      explored: known,
      spotted: [],
      lastSeen: {},
    });
    expect(Array.from(ground.image.data!)).toEqual([0, 0, 255]);
    expect(Array.from(roof.image.data!)).toEqual([0, 255, 0]);
    expect(groups[0]!.children[0]?.visible).toBe(true);

    fog.setVision({ visible: [], explored: known, spotted: [], lastSeen: {} });
    expect(Array.from(ground.image.data!)).toEqual([0, 0, 255]);
    // A preview has no vision restriction and must have no mist.
    fog.setVision(undefined);
    expect(Array.from(ground.image.data!)).toEqual([0, 0, 0]);
    expect(groups[0]!.children[0]?.visible).toBe(false);
    expect(groups[1]!.children[0]?.visible).toBe(false);

    // A fresh side / mission does not inherit the previous mask.
    fog.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    expect(Array.from(ground.image.data!)).toEqual([255, 255, 255]);
    fog.dispose();
  });

  it("never paints currently visible ground, even before explored catches up", () => {
    const map = new FixtureMapBuilder(1, 1, 1).fillGround().build();
    const group = new Group();
    const fog = new UnexploredFog(map);
    fog.attachTo(() => group);
    fog.setVision({ visible: [0], explored: [], spotted: [], lastSeen: {} });
    expect(Array.from(maskOf(group).image.data!)).toEqual([0]);
    expect(group.children[0]?.visible).toBe(false);
    fog.dispose();
  });

  it("releases GPU resources and detaches all mist when the mission ends", () => {
    const map = new FixtureMapBuilder(1, 1, 1).fillGround().build();
    const group = new Group();
    const fog = new UnexploredFog(map);
    fog.attachTo(() => group);
    const disposed = vi.fn();
    maskOf(group).addEventListener("dispose", disposed);
    const mesh = group.children[0]!.children[0] as Mesh;
    mesh.geometry.addEventListener("dispose", disposed);
    for (const sheet of group.children[0]!.children) {
      ((sheet as Mesh).material as ShaderMaterial).addEventListener(
        "dispose",
        disposed,
      );
    }
    fog.dispose();
    expect(disposed).toHaveBeenCalledTimes(5);
    expect(group.children).toHaveLength(0);
  });
});

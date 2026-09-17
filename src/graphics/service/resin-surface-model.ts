import { Box3, Group, Mesh, Raycaster, Vector3 } from "three";
import type { BufferGeometry, Material, Object3D } from "three";
import type { ResinSurfaceAppearance } from "./map-model-resolver";

/** Stable fitted geometry identity; map position is deliberately excluded. */
export function resinSurfaceKey(appearance: ResinSurfaceAppearance): string {
  const p = appearance.support;
  if (appearance.conform === false)
    return JSON.stringify(["flat", appearance.pattern, appearance.thickness]);
  return JSON.stringify([
    p.modelId,
    p.turns,
    p.scaleX,
    p.scaleY,
    p.scaleZ,
    p.terrain,
    p.roof,
    p.ramp?.surface,
    appearance.pattern,
    appearance.conform,
    appearance.turns,
    appearance.size,
    appearance.thickness,
  ]);
}

/**
 * Conforms authored shell geometry to the actual rendered support, including
 * stairs, ramps, slope transitions and pitched roofs. Geometry is owned by the
 * caller; materials and both source prototypes remain untouched.
 */
export function fitResinSurface(
  resin: Object3D,
  support: Object3D,
  appearance: ResinSurfaceAppearance,
): Group {
  const p = appearance.support;
  const target = support.clone(true);
  const wrapper = new Group();
  wrapper.add(target);
  wrapper.rotation.y = (-p.turns * Math.PI) / 2;
  wrapper.scale.set(p.scaleX ?? 1, p.scaleY ?? 1, p.scaleZ ?? 1);
  wrapper.updateMatrixWorld(true);
  const height = new Box3().setFromObject(wrapper).max.y + 1;
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  const heights = new Map<string, number>();
  const result = new Group();
  resin.updateMatrixWorld(true);
  resin.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.scale(appearance.size, appearance.thickness, appearance.size);
    geometry.rotateY((-appearance.turns * Math.PI) / 2);
    if (!appearance.pattern) {
      geometry.scale(p.scaleX ?? 1, 1, p.scaleZ ?? 1);
      geometry.rotateY((-p.turns * Math.PI) / 2);
    }
    const vertices = geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i),
        z = vertices.getZ(i);
      const key = `${x}:${z}`;
      let top = heights.get(key);
      if (appearance.conform === false) top = 0;
      if (top === undefined) {
        // The shell edge sits exactly on the support boundary. Nudge the
        // sampling ray inward to avoid missing a shared triangle edge.
        ray.ray.origin.set(x * 0.9999, height, z * 0.9999);
        top = ray.intersectObject(wrapper, true)[0]?.point.y ?? 0;
        heights.set(key, top);
      }
      vertices.setY(i, vertices.getY(i) + top);
    }
    vertices.needsUpdate = true;
    if (appearance.conform !== false) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    result.add(new Mesh(geometry, mesh.material));
  });
  return result;
}

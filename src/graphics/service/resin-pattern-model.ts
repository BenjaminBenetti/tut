import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Matrix3,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Material, Object3D } from "three";
import type { ResinPatternAppearance } from "../model/resin-pattern-appearance";
import { resinColonyDensity } from "./resin-colony-field";
import { RESIN_STYLE, RESIN_NEIGHBOURS } from "../data/resin-style";

interface Vertex {
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly uv: readonly [number, number];
}

interface Plane {
  readonly x: number;
  readonly z: number;
  readonly limit: number;
}

/** Stable identity for a slice of the authored network, independent of its support. */
export function resinPatternKey(pattern: ResinPatternAppearance): string {
  return JSON.stringify(pattern);
}

/** Interpolates all vertex attributes where a strand crosses an ownership boundary. */
function interpolate(a: Vertex, b: Vertex, t: number): Vertex {
  return {
    position: a.position.clone().lerp(b.position, t),
    normal: a.normal.clone().lerp(b.normal, t).normalize(),
    uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t],
  };
}

/** Clips a triangle/polygon without resampling its shared seam vertices or UVs. */
function clip(vertices: readonly Vertex[], plane: Plane): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    const da = a.position.x * plane.x + a.position.z * plane.z - plane.limit;
    const db = b.position.x * plane.x + b.position.z * plane.z - plane.limit;
    if (da <= 0) result.push(a);
    if (da < 0 !== db < 0) result.push(interpolate(a, b, da / (da - db)));
  }
  return result;
}

/** Extracts the authored material primitives and their world transforms. */
function meshes(root: Object3D): Mesh<BufferGeometry, Material | Material[]>[] {
  const result: Mesh<BufferGeometry, Material | Material[]>[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object instanceof Mesh)
      result.push(object as Mesh<BufferGeometry, Material | Material[]>);
  });
  return result;
}

interface PreparedPart {
  readonly cells: readonly (readonly Vertex[][])[];
}

/**
 * Matures and bends each canvas in a shared world-space colony field, then
 * bins triangles into ownership cells and clips each patch's exposed fringe.
 * The factory owns one atlas material; callers own every returned geometry.
 */
export class ResinPatternModelFactory {
  private readonly material: Material;
  private readonly prepared = new Map<string, readonly PreparedPart[]>();

  /** Borrows the source GLB and its authored Mature morph target. */
  constructor(private readonly source: Object3D) {
    const first = meshes(source)[0];
    if (!first) throw new Error("Resin web has no authored geometry");
    const material = Array.isArray(first.material)
      ? first.material[0]!
      : first.material;
    this.material = material.clone();
    this.material.name = "resin-skin";
    if (this.material instanceof MeshStandardMaterial)
      this.material.roughness = 0.48;
  }

  /** Releases the shared skin material; slice geometries belong to the view. */
  dispose(): void {
    this.material.dispose();
    this.prepared.clear();
  }

  /** Cuts one support footprint out of the continuous web, preserving shared seams. */
  create(pattern: ResinPatternAppearance): Group {
    const result = new Group();
    const pieces: BufferGeometry[] = [];
    const period = RESIN_STYLE.patternSize;
    const cx = pattern.x - (period - 1) / 2 + (pattern.offsetX ?? 0);
    const cz = pattern.z - (period - 1) / 2 + (pattern.offsetZ ?? 0);
    const halfX = (pattern.width ?? 1) / 2;
    const halfZ = (pattern.depth ?? 1) / 2;
    const borders: Plane[] = RESIN_NEIGHBOURS.flatMap(([x, z], i) =>
      pattern.neighbours & (1 << i)
        ? []
        : [
            {
              x,
              z,
              limit:
                (Math.abs(x) + Math.abs(z)) / 2 -
                RESIN_STYLE.fringeInset -
                x * (pattern.offsetX ?? 0) -
                z * (pattern.offsetZ ?? 0),
            },
          ],
    );
    const planes: Plane[] = [
      { x: 1, z: 0, limit: halfX },
      { x: -1, z: 0, limit: halfX },
      { x: 0, z: 1, limit: halfZ },
      { x: 0, z: -1, limit: halfZ },
      ...borders,
    ];
    const parts = this.prepare(pattern);
    parts.forEach(({ cells }) => {
      const positions: number[] = [],
        outputNormals: number[] = [],
        uvs: number[] = [];
      for (const triangle of cells[pattern.z * period + pattern.x]!) {
        const xs = triangle.map((v) => v.position.x - cx);
        const zs = triangle.map((v) => v.position.z - cz);
        let polygon = triangle.map((v, j) => ({
          ...v,
          position: new Vector3(xs[j], v.position.y, zs[j]),
        }));
        for (const plane of planes) polygon = clip(polygon, plane);
        for (let j = 1; j < polygon.length - 1; j++)
          for (const v of [polygon[0]!, polygon[j]!, polygon[j + 1]!]) {
            const distance = Math.min(
              ...borders.map(
                (p) => p.limit - v.position.x * p.x - v.position.z * p.z,
              ),
            );
            const taper = Math.min(
              1,
              Math.max(0, distance / RESIN_STYLE.fringeTaper),
            );
            positions.push(
              v.position.x,
              v.position.y * (0.12 + 0.88 * taper),
              v.position.z,
            );
            outputNormals.push(v.normal.x, v.normal.y, v.normal.z);
            uvs.push(...v.uv);
          }
      }
      if (!positions.length) return;
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new Float32BufferAttribute(outputNormals, 3),
      );
      geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      pieces.push(geometry);
    });
    if (pieces.length) {
      // Palette colours already live in shared-atlas UVs. One material keeps
      // the connected skin to one draw per batch instead of one per colour.
      const combined = mergeGeometries(pieces, false);
      for (const piece of pieces) piece.dispose();
      result.add(new Mesh(combined, this.material));
    }
    return result;
  }

  /** Caches each deformed canvas and assigns its triangles to ownership cells. */
  private prepare(pattern: ResinPatternAppearance): readonly PreparedPart[] {
    const key = JSON.stringify([pattern.turns, pattern.growth, pattern.colony]);
    const cached = this.prepared.get(key);
    if (cached) return cached;
    const period = RESIN_STYLE.patternSize;
    const axis = new Vector3(0, 1, 0);
    const parts = meshes(this.source).map((source): PreparedPart => {
      const a = source.geometry.getAttribute("position");
      const b = source.geometry.morphAttributes.position?.[0];
      const normal = source.geometry.getAttribute("normal");
      const deltaNormal = source.geometry.morphAttributes.normal?.[0];
      if (
        !b ||
        !deltaNormal ||
        b.count !== a.count ||
        !source.geometry.morphTargetsRelative
      )
        throw new Error("Resin web requires its authored Mature morph target");
      const uv = source.geometry.getAttribute("uv");
      const index = source.geometry.index;
      const count = index?.count ?? a.count;
      const angle = (-pattern.turns * Math.PI) / 2;
      const authored = Array.from({ length: a.count }, (_, i) => ({
        position: new Vector3()
          .fromBufferAttribute(a, i)
          .applyMatrix4(source.matrixWorld)
          .applyAxisAngle(axis, angle),
        delta: new Vector3()
          .fromBufferAttribute(b, i)
          .applyMatrix3(new Matrix3().setFromMatrix4(source.matrixWorld))
          .applyAxisAngle(axis, angle),
        normal: new Vector3()
          .fromBufferAttribute(normal, i)
          .transformDirection(source.matrixWorld)
          .applyAxisAngle(axis, angle),
        deltaNormal: new Vector3()
          .fromBufferAttribute(deltaNormal, i)
          .applyMatrix3(new Matrix3().setFromMatrix4(source.matrixWorld))
          .applyAxisAngle(axis, angle),
        uv: [uv.getX(i), uv.getY(i)] as const,
      }));
      const cells: Vertex[][][] = Array.from(
        { length: period * period },
        () => [],
      );
      for (const dx of [-period, 0, period])
        for (const dz of [-period, 0, period]) {
          const vertices: Vertex[] = authored.map((v) => {
            const position = v.position.clone().add(new Vector3(dx, 0, dz));
            const colony = pattern.colony;
            const wx = position.x + (colony?.x ?? 0);
            const wz = position.z + (colony?.z ?? 0);
            const density = colony
              ? resinColonyDensity(wx, wz, colony.seed)
              : 1;
            const growth = pattern.growth * (0.06 + density * 0.94);
            position.addScaledVector(v.delta, growth);
            if (colony) {
              const phase = (colony.seed % 997) * 0.013;
              // Deform before ownership clipping: neighbouring tiles and canvas
              // wraps share the same source vertices and the same world field.
              position.x +=
                0.34 * Math.sin(wz * 0.63 + phase) +
                0.16 * Math.sin(wx * 0.91 + wz * 0.37);
              position.z +=
                0.31 * Math.sin(wx * 0.57 - phase) +
                0.13 * Math.cos(wz * 0.83 - wx * 0.23);
              position.y *= 0.45 + 0.55 * density;
            }
            return {
              position,
              normal: v.normal
                .clone()
                .addScaledVector(v.deltaNormal, growth)
                .normalize(),
              uv: v.uv,
            };
          });
          for (let i = 0; i < count; i += 3) {
            const triangle = [0, 1, 2].map(
              (j) => vertices[index?.getX(i + j) ?? i + j]!,
            );
            const xs = triangle.map((v) => v.position.x);
            const zs = triangle.map((v) => v.position.z);
            const minX = Math.max(0, Math.floor(Math.min(...xs) + period / 2));
            const maxX = Math.min(
              period - 1,
              Math.floor(Math.max(...xs) + period / 2),
            );
            const minZ = Math.max(0, Math.floor(Math.min(...zs) + period / 2));
            const maxZ = Math.min(
              period - 1,
              Math.floor(Math.max(...zs) + period / 2),
            );
            for (let z = minZ; z <= maxZ; z++)
              for (let x = minX; x <= maxX; x++)
                cells[z * period + x]!.push(triangle);
          }
        }
      return { cells };
    });
    this.prepared.set(key, parts);
    return parts;
  }
}

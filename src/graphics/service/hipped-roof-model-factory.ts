import { Group, Mesh, type BufferGeometry } from "three";
import { HIPPED_ROOF_MODEL } from "../data/map-model-table";
import type { ModelLoader } from "../model/model-loader";

type Profile = readonly [number, number, number];

/** Fits the Blender hip cap while borrowing its one shared painted-metal material. */
export class HippedRoofModelFactory {
  /** Uses the scene's loader and prototype cache. */
  constructor(private readonly models: ModelLoader) {}

  /** Caller owns fitted geometry; the closed ceiling stays at the wall line. */
  async create(width: Profile, depth: Profile): Promise<Group> {
    const result = new Group();
    const source = await this.models.load(HIPPED_ROOF_MODEL);
    source.updateMatrixWorld(true);
    source.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const original = object as Mesh;
      const geometry = original.geometry.index
        ? original.geometry.toNonIndexed()
        : original.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      fitProfile(geometry, width, depth);
      result.add(new Mesh(geometry, original.material));
    });
    return result;
  }
}

/** Retains the cap's sides and ceiling, following the high diagonal at each hip fold. */
function fitProfile(
  geometry: BufferGeometry,
  width: Profile,
  depth: Profile,
): void {
  const position = geometry.getAttribute("position");
  const squares = new Map<number, number[]>();
  for (let i = 0; i < position.count; i += 3) {
    const indices = [i, i + 1, i + 2];
    if (indices.every((j) => position.getY(j) > 0.001)) {
      const col = Math.min(...indices.map((j) => gridIndex(position.getX(j))));
      const row = Math.min(...indices.map((j) => gridIndex(position.getZ(j))));
      const key = row * 2 + col;
      squares.set(key, [...(squares.get(key) ?? []), ...indices]);
    }
  }
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) < 0.001) continue;
    position.setY(
      i,
      Math.min(
        width[gridIndex(position.getX(i))]!,
        depth[gridIndex(position.getZ(i))]!,
      ),
    );
  }
  for (const [key, indices] of squares) {
    const col = key % 2,
      row = Math.floor(key / 2);
    const points = [
      [col, row],
      [col + 1, row],
      [col + 1, row + 1],
      [col, row + 1],
    ] as const;
    const heights = points.map(([x, z]) => Math.min(width[x]!, depth[z]!));
    // The minimum of the two linear profiles is concave. Connecting the
    // higher diagonal follows its ridge; the other diagonal cuts a dent.
    const corners =
      heights[0]! + heights[2]! >= heights[1]! + heights[3]!
        ? [0, 2, 1, 0, 3, 2]
        : [0, 3, 1, 1, 3, 2];
    for (let i = 0; i < indices.length; i++) {
      const corner = corners[i]!;
      const [x, z] = points[corner]!;
      position.setXYZ(indices[i]!, x / 2 - 0.5, heights[corner]!, z / 2 - 0.5);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** The source's X and Z coordinates are exactly -0.5, 0 and +0.5. */
function gridIndex(coordinate: number): number {
  return Math.round((coordinate + 0.5) * 2);
}

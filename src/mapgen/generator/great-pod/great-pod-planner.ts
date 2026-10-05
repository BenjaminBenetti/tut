import type {
  GreatPodAxis,
  GreatPodChamber,
  GreatPodLayout,
} from "../../model/great-pod-layout";
import type { GreatPodTuning } from "../../model/great-pod-tuning";
import type { ColumnCoord } from "../../model/road";

// ===========================================
// Constants
// ===========================================

/** The eight neighbours of a column, as offsets. */
const RING_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** The outer chambers, by compass point, as unit offsets from the centre. */
const OUTER_CHAMBERS: readonly {
  readonly name: string;
  readonly dx: number;
  readonly dz: number;
}[] = [
  { name: "north", dx: 0, dz: -1 },
  { name: "east", dx: 1, dz: 0 },
  { name: "south", dx: 0, dz: 1 },
  { name: "west", dx: -1, dz: 0 },
];

// ===========================================
// Planner
// ===========================================

/**
 * Lays a great pod out round `centre` (#1238): pure geometry, no draws.
 * Every column within the disc is sorted by its offset from the centre:
 *
 * ```
 *   d = hypot(dx, dz); "in r" means d ≤ r + ½ (a round digital disc)
 *
 *   not in hullRadius                     ──► apron (verge if in hullRadius + verge)
 *   in hullRadius, a neighbour out of it  ──► hull ring: seam on the axis, else plate
 *   in the core's square                  ──► floor (the core)
 *   in membraneRadius, a neighbour out    ──► membrane ring: mouth on the axis, else wall
 *   in membraneRadius                     ──► floor (the core chamber)
 *   on a diagonal, |a| − |b| ∈ {0, 1}     ──► rib (a, b the offset turned into one quadrant)
 *   otherwise                             ──► floor (an outer chamber)
 * ```
 *
 * A ring is a disc's columns with any of their eight neighbours outside
 * it, so every ring is four-connected: nothing walks or sees through a
 * diagonal gap. Each rib is a staircase two columns wide, turned by a
 * quarter for each quadrant, joining the membrane to the hull without a
 * diagonal gap either, so the four outer chambers are sealed from each
 * other and only the two on the axis open on the core.
 *
 * @param centre - The column under the middle of the core.
 * @param level - The ground level the disc was levelled to.
 * @param axis - Which sides the mouths and seams face.
 * @param tuning - The pod's dimensions.
 * @returns The layout, every list in row order (z, then x).
 */
export function planGreatPod(
  centre: ColumnCoord,
  level: number,
  axis: GreatPodAxis,
  tuning: GreatPodTuning,
): GreatPodLayout {
  const discRadius = tuning.hullRadius + tuning.apron;
  const coreHalf = Math.floor(tuning.coreSize / 2);
  const hull: ColumnCoord[] = [];
  const seams: ColumnCoord[] = [];
  const membrane: ColumnCoord[] = [];
  const ribs: ColumnCoord[] = [];
  const mouths: ColumnCoord[] = [];
  const floor: ColumnCoord[] = [];
  const apron: ColumnCoord[] = [];
  const verge: ColumnCoord[] = [];
  const onAxis = (dx: number, dz: number): boolean =>
    Math.abs(axis === "ns" ? dx : dz) <= tuning.mouthHalfWidth;
  for (let dz = -discRadius - 1; dz <= discRadius + 1; dz++) {
    for (let dx = -discRadius - 1; dx <= discRadius + 1; dx++) {
      if (!inDisc(dx, dz, discRadius)) continue;
      const column = { x: centre.x + dx, z: centre.z + dz };
      if (!inDisc(dx, dz, tuning.hullRadius)) {
        apron.push(column);
        if (inDisc(dx, dz, tuning.hullRadius + tuning.verge)) {
          verge.push(column);
        }
      } else if (onRing(dx, dz, tuning.hullRadius)) {
        (onAxis(dx, dz) ? seams : hull).push(column);
      } else if (Math.max(Math.abs(dx), Math.abs(dz)) <= coreHalf) {
        floor.push(column);
      } else if (inDisc(dx, dz, tuning.membraneRadius)) {
        if (!onRing(dx, dz, tuning.membraneRadius)) {
          floor.push(column);
        } else if (onAxis(dx, dz)) {
          mouths.push(column);
          floor.push(column);
        } else {
          membrane.push(column);
        }
      } else if (isRib(dx, dz)) {
        ribs.push(column);
      } else {
        floor.push(column);
      }
    }
  }
  return {
    centre: { x: centre.x, z: centre.z },
    level,
    axis,
    discRadius,
    hull,
    seams,
    membrane,
    ribs,
    mouths,
    floor,
    core: {
      x: centre.x - coreHalf,
      z: centre.z - coreHalf,
      size: tuning.coreSize,
    },
    apron,
    verge,
    chambers: chambersOf(centre, axis, tuning),
  };
}

// ===========================================
// Helpers
// ===========================================

/** True when the offset lies in the round digital disc of `radius`. */
function inDisc(dx: number, dz: number, radius: number): boolean {
  return Math.hypot(dx, dz) <= radius + 0.5;
}

/** True when the offset is in the disc of `radius` and a neighbour is not. */
function onRing(dx: number, dz: number, radius: number): boolean {
  return (
    inDisc(dx, dz, radius) &&
    RING_OFFSETS.some(([ox, oz]) => !inDisc(dx + ox, dz + oz, radius))
  );
}

/**
 * True on a rib: the offset, turned by quarter turns into the quadrant
 * `a > 0, b ≥ 0`, lies on the diagonal or one column off it toward `a`.
 */
function isRib(dx: number, dz: number): boolean {
  let a = dx;
  let b = dz;
  for (let turn = 0; turn < 4 && !(a > 0 && b >= 0); turn++) {
    [a, b] = [b, -a];
  }
  return a > 0 && b >= 0 && (a - b === 0 || a - b === 1);
}

/**
 * The core chamber and the four outer chambers, each centred on its
 * compass axis halfway between membrane and hull; the two on the mouth
 * axis are route chambers, the other two side chambers.
 */
function chambersOf(
  centre: ColumnCoord,
  axis: GreatPodAxis,
  tuning: GreatPodTuning,
): readonly GreatPodChamber[] {
  const middle = Math.round((tuning.membraneRadius + tuning.hullRadius) / 2);
  const outer = OUTER_CHAMBERS.map(
    (chamber): GreatPodChamber => ({
      id: `pod-${chamber.name}`,
      role: (axis === "ns" ? chamber.dx === 0 : chamber.dz === 0)
        ? "route"
        : "side",
      centre: {
        x: centre.x + chamber.dx * middle,
        z: centre.z + chamber.dz * middle,
      },
      radius: tuning.chamberRadius,
    }),
  );
  return [
    {
      id: "pod-core",
      role: "core",
      centre: { x: centre.x, z: centre.z },
      radius: tuning.coreChamberRadius,
    },
    ...outer,
  ];
}

import { BufferAttribute, BufferGeometry } from "three";

// ===========================================
// Corner brackets
// ===========================================

/**
 * Four thin L-shaped brackets around a square, in the XY plane like
 * `RingGeometry`, so a mesh wearing it lies flat once turned
 * `-π/2` about X (#1155). Eight quads, sixteen triangles: each corner
 * has one arm along X and one along Y, both `arm` long and
 * `thickness` wide, meeting at the corner.
 *
 * ```
 *   ┌──        ──┐
 *   │            │      half: centre to the outer edge of a bracket
 *                       arm:  length of each leg from the corner
 *   │            │      thickness: width of a leg
 *   └──        ──┘
 * ```
 */
export function cornerBracketGeometry(
  half: number,
  arm: number,
  thickness: number,
): BufferGeometry {
  const positions: number[] = [];
  const quad = (x0: number, y0: number, x1: number, y1: number): void => {
    positions.push(
      x0,
      y0,
      0,
      x1,
      y0,
      0,
      x1,
      y1,
      0,
      x0,
      y0,
      0,
      x1,
      y1,
      0,
      x0,
      y1,
      0,
    );
  };
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = sx * half;
      const cy = sy * half;
      // Arm along X: from the corner toward the centre.
      quad(
        Math.min(cx, cx - sx * arm),
        Math.min(cy, cy - sy * thickness),
        Math.max(cx, cx - sx * arm),
        Math.max(cy, cy - sy * thickness),
      );
      // Arm along Y.
      quad(
        Math.min(cx, cx - sx * thickness),
        Math.min(cy, cy - sy * arm),
        Math.max(cx, cx - sx * thickness),
        Math.max(cy, cy - sy * arm),
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.computeBoundingSphere();
  return geometry;
}

import type { Vec3 } from "../../core/model/grid";

/** Parabolic lift whose peak reaches `apex`, including unequal endpoint heights. */
export function jumpArcLift(fromY: number, toY: number, apex: number): number {
  const rise = Math.max(0, apex - fromY);
  const fall = Math.max(0, apex - toY);
  return rise + fall + 2 * Math.sqrt(rise * fall);
}

/** Inverts the smooth horizontal motion to locate a crossed map edge on the flight curve. */
export function jumpArcTime(fraction: number): number {
  if (fraction <= 0) return 0;
  if (fraction >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (middle * middle * (3 - 2 * middle) < fraction) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** One uninterrupted arch: forward motion throughout, with a smooth rise and fall. */
export function jumpArcPoint(
  from: Vec3,
  to: Vec3,
  apex: number,
  progress: number,
): Vec3 {
  const t = Math.max(0, Math.min(1, progress));
  const across = t * t * (3 - 2 * t);
  return {
    x: from.x + (to.x - from.x) * across,
    y:
      from.y +
      (to.y - from.y) * t +
      jumpArcLift(from.y, to.y, apex) * t * (1 - t),
    z: from.z + (to.z - from.z) * across,
  };
}

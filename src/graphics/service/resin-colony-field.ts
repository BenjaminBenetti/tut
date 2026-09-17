/** Smooth map-scale colony density, shared by the ground skin and attached organs. */
export function resinColonyDensity(x: number, z: number, seed: number): number {
  const phase = (seed % 997) * 0.013;
  const field =
    Math.sin(x * 0.37 + Math.sin(z * 0.19 + phase) * 1.7 + phase) * 0.48 +
    Math.cos(z * 0.43 - x * 0.13 + phase * 2) * 0.33 +
    Math.sin((x + z) * 0.81 + phase) * 0.19;
  return Math.max(0, Math.min(1, (field + 0.65) / 1.3));
}

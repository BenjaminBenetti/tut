/** Bounds shared by mission recipes and the Map Lab dial. */
export const MIN_INFESTATION_LEVEL = 0;
export const MAX_INFESTATION_LEVEL = 10;

/** True for one of the eleven whole-number map infestation settings. */
export function isInfestationLevel(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_INFESTATION_LEVEL &&
    value <= MAX_INFESTATION_LEVEL
  );
}

/** One map level per started ten-point overworld segment; zero stays clean. */
export function infestationLevelFromMeter(infestation: number): number {
  if (!Number.isFinite(infestation)) return 0;
  return Math.ceil(Math.min(100, Math.max(0, infestation)) / 10);
}

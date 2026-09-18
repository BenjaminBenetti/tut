/** Converts overworld infestation (0–100) to completed ten-point map bands (0–10). */
export function mapInfestationLevel(infestation: number): number {
  if (!Number.isFinite(infestation)) return 0;
  return Math.floor(Math.max(0, Math.min(100, infestation)) / 10);
}

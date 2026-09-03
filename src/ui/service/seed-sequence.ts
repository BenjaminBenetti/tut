// ===========================================
// Seed sequence
// ===========================================

/**
 * The seed after `seed` for stepping through a series in the preview: a
 * trailing integer is incremented and keeps its zero padding; a seed
 * without one gets `-2` appended.
 *
 * ```
 *   terra-01 ─► terra-02      seed9 ─► seed10      coast ─► coast-2
 * ```
 */
export function nextSeed(seed: string): string {
  const match = /^(.*?)(\d+)$/.exec(seed);
  if (match === null) {
    return `${seed}-2`;
  }
  const [, prefix = "", digits = "0"] = match;
  const next = String(Number(digits) + 1);
  return `${prefix}${next.padStart(digits.length, "0")}`;
}

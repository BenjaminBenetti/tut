import { hashSeed } from "../../core/service/seed-hash";

// ===========================================
// Constants
// ===========================================

/** Largest value a typed seed may take before it is hashed as text instead. */
const MAX_SEED = 0xffffffff;

// ===========================================
// Seed input
// ===========================================

/**
 * Turns whatever the player typed into the seed box into an unsigned
 * 32-bit seed: blank uses the fallback, a plain number in range is used
 * as-is so a seed can be shared verbatim, and anything else is hashed so
 * memorable text like `terra-01` is a stable seed too.
 *
 * ```
 *   ""            ──► fallback()
 *   "12345"       ──► 12345
 *   "terra-01"    ──► hashSeed("terra-01")
 *   "99999999999" ──► hashSeed(...)   (out of range, treated as text)
 * ```
 */
export function resolveSeed(text: string, fallback: () => number): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return fallback() >>> 0;
  }
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed);
    if (Number.isSafeInteger(value) && value <= MAX_SEED) {
      return value;
    }
  }
  return hashSeed(trimmed);
}

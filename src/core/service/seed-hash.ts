// ===========================================
// Seed hashing
// ===========================================

/**
 * Hashes an arbitrary string into an unsigned 32-bit seed using the
 * xmur3 finalizer, so players can type memorable seeds like
 * `"terra-01"` and get a stable generator.
 */
export function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

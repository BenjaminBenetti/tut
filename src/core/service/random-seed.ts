// ===========================================
// Random seed source
// ===========================================

/**
 * Produces a fresh unsigned 32-bit seed for a new game. This is the only
 * place in the codebase allowed to call `Math.random()`; everything
 * downstream is deterministic from the seed it returns (architecture §2).
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

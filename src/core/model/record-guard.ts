// ===========================================
// Record guard
// ===========================================

/**
 * Narrows an unknown value to a plain object: not `null`, not an array.
 * Shared by anything that walks untrusted JSON (save migrations, the
 * game-state guard), so the two never drift on what "an object" means.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

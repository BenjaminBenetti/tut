// ===========================================
// Persona id
// ===========================================

/**
 * The named enemies a mission can mark a bug as (campaign arc §9, ADR
 * 0013 §2.8). A closed union so `PERSONAS` in `bugs/data/personas` must
 * define every member; a boss package adds its persona here and its
 * definition there, and any table keyed by this id that forgets one
 * fails to compile.
 *
 * ```
 *   Unit { kind: "bug", persona: "broodmother" }
 *            │
 *            └──► PERSONAS.broodmother ──► name, Jev prompts, fallback behaviour
 * ```
 */
export type PersonaId = "broodmother" | "alpha" | "sovereign";

/** Every persona id, in a fixed order. */
export const PERSONA_IDS: readonly PersonaId[] = [
  "broodmother",
  "alpha",
  "sovereign",
];

/**
 * Whether `id` names a persona the game ships. A persona read back from
 * a save written by a newer build may be one this build does not know;
 * every lookup goes through this guard rather than indexing blind.
 *
 * @param id - Any string, typically `Unit.persona` from a loaded save.
 * @returns True when `id` is a member of `PersonaId`.
 */
export function isPersonaId(id: string): id is PersonaId {
  return (PERSONA_IDS as readonly string[]).includes(id);
}

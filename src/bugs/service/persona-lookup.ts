import type { PersonaId } from "../../content/model/persona-id";
import { isPersonaId } from "../../content/model/persona-id";
import type { PersonaDefinition, PersonaLookup } from "../model/persona";

// ===========================================
// Persona lookup
// ===========================================

/**
 * A `PersonaLookup` over a persona table: the bug phase, the name
 * resolver and the app's Jev policy hand it a unit's `persona` and get
 * its definition.
 *
 * ```
 *   unit.persona "broodmother" ──► PERSONAS.broodmother
 *   unit.persona "toString" ─────► undefined            (never indexes the record blind)
 * ```
 *
 * @param personas - Every persona, keyed by id; the shipped `PERSONAS` in the app.
 * @returns A lookup that answers `undefined` for anything outside `PersonaId`.
 */
export function createPersonaLookup(
  personas: Readonly<Record<PersonaId, PersonaDefinition>>,
): PersonaLookup {
  return (id) => (isPersonaId(id) ? personas[id] : undefined);
}

/**
 * What the player and Jev call a unit carrying `persona`: the display
 * name alone for a one-of-a-kind enemy ("Broodmother"), or with its
 * species after it when the persona says so ("Alpha Lurker").
 *
 * @param persona - The unit's persona.
 * @param speciesName - The unit's template name, which for a bug is its species.
 * @returns The unit's name.
 */
export function personaName(
  persona: PersonaDefinition,
  speciesName: string | undefined,
): string {
  return persona.withSpecies === true && speciesName !== undefined
    ? `${persona.displayName} ${speciesName}`
    : persona.displayName;
}

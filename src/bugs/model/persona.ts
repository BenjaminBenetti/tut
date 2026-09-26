import type { PersonaId } from "../../content/model/persona-id";
import type { BehaviourTag } from "./bug-species";

// ===========================================
// Fallback
// ===========================================

/**
 * The fallback that means "play this unit's own species behaviour". An
 * alpha is its species plus a little (campaign arc §9), so until a
 * behaviour of its own lands it fights exactly as its species does.
 */
export const SPECIES_FALLBACK = "species";

/**
 * What a persona plays without Jev: a behaviour tag, or
 * `SPECIES_FALLBACK` for the unit's own species behaviour. This is what
 * unit tests, the sim sweeps, players with no relay and every failed Jev
 * call get (ADR 0012, ADR 0013 §2.8).
 */
export type PersonaFallback = BehaviourTag | typeof SPECIES_FALLBACK;

// ===========================================
// Persona definition
// ===========================================

/**
 * One named enemy (campaign arc §9, ADR 0013 §2.8). One record per
 * persona lives in `bugs/data/personas.ts`; a mission's setup rule marks
 * a bug `Unit` with its id, and everything else follows from here.
 *
 * ```
 *   Unit.persona ──► PersonaDefinition
 *                      ├── displayName ─────────► unit card, event log, Jev `name`
 *                      ├── entityPrompt ────────► configureJev(unit, { entityPrompt })   (app policy)
 *                      ├── commanderPrompt ─────► the bugs' commander prompt, unless one is set
 *                      └── fallback ────────────► behaviour without Jev (bug phase, failed calls)
 * ```
 *
 * The prompts may only ask for what Jev can observe: faction-shared
 * vision, the actor's own HP and AP, the objectives and the offered
 * moves (`tactical/data/jev-protocol.json`). A prompt that leans on an
 * event log, a spawn timer or an unseen unit asks for something the
 * observation never carries.
 */
export interface PersonaDefinition {
  /** Unique catalogue key. */
  readonly id: PersonaId;
  /** What the player and Jev call the unit, e.g. `"Broodmother"`. */
  readonly displayName: string;
  /**
   * True when the name is `"<displayName> <species>"` ("Alpha Lurker")
   * rather than the display name alone: a persona any species can carry
   * reads with its species, so the player still knows what it is and a
   * bare "Alpha" never reads as the TDF's Alpha squad.
   */
  readonly withSpecies?: boolean;
  /** The entity's own orders when the policy puts it under Jev (`JevEntityControl.entityPrompt`). */
  readonly entityPrompt: string;
  /** The bug commander's orders while this persona is present, unless the mission already has some. */
  readonly commanderPrompt: string;
  /** The deterministic behaviour it plays without Jev. */
  readonly fallback: PersonaFallback;
}

// ===========================================
// Lookup
// ===========================================

/**
 * Resolves a `Unit.persona` to its definition; the shipped table in the
 * app, a stub in tests. Takes a plain string because a save can carry a
 * persona this build does not know, and that must resolve to nothing.
 */
export type PersonaLookup = (id: string) => PersonaDefinition | undefined;

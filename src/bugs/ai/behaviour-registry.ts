import type { MissionView } from "../../tactical/model/mission-view";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { Unit, UnitId } from "../../tactical/model/unit";
import type { BehaviourTag, BugSpecies } from "../model/bug-species";
import type { PersonaLookup } from "../model/persona";
import { SPECIES_FALLBACK } from "../model/persona";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";

// ===========================================
// Types
// ===========================================

/** Read side: the behaviour for a tag, if one is registered. */
export interface BehaviourLookup {
  /**
   *
   */
  get(tag: BehaviourTag): BugBehaviour | undefined;
}

/** Registry the composition root fills, one behaviour per tag. */
export interface BehaviourRegistry extends BehaviourLookup {
  /**
   * Registers a behaviour under its own tag.
   *
   * @throws {Error} if that tag already has a behaviour; that is a
   *   wiring mistake, not a game state.
   */
  register(behaviour: BugBehaviour): void;
}

/** Resolves a unit's `sourceId` to its species; the catalogue in the app, a stub in tests. */
export type SpeciesLookup = (id: string) => BugSpecies | undefined;

// ===========================================
// MapBehaviourRegistry
// ===========================================

/**
 * `BehaviourRegistry` over a map. The bug phase asks it for each living
 * bug's behaviour by species tag; registration happens at the
 * composition root as the species issues land (#332, #333, #334).
 */
export class MapBehaviourRegistry implements BehaviourRegistry {
  // ===========================================
  // Fields
  // ===========================================

  private readonly byTag = new Map<BehaviourTag, BugBehaviour>();

  // ===========================================
  // Construction
  // ===========================================

  /** Starts with the given behaviours; duplicates throw. */
  constructor(behaviours: readonly BugBehaviour[] = []) {
    for (const behaviour of behaviours) {
      this.register(behaviour);
    }
  }

  // ===========================================
  // BehaviourRegistry
  // ===========================================

  /** Registers one behaviour under its tag. */
  register(behaviour: BugBehaviour): void {
    if (this.byTag.has(behaviour.tag)) {
      throw new Error(`Duplicate bug behaviour for tag "${behaviour.tag}"`);
    }
    this.byTag.set(behaviour.tag, behaviour);
  }

  /** The behaviour for a tag, or undefined when none is registered. */
  get(tag: BehaviourTag): BugBehaviour | undefined {
    return this.byTag.get(tag);
  }

  /** Every registered tag, in registration order. */
  tags(): readonly BehaviourTag[] {
    return [...this.byTag.keys()];
  }
}

// ===========================================
// Choosing
// ===========================================

/**
 * The behaviour tag a bug plays by without Jev (ADR 0013 §2.8): its
 * persona's fallback when it carries a persona the lookup knows, else
 * its species' own tag. A persona whose fallback is `SPECIES_FALLBACK`,
 * or one this build does not know, plays the species.
 *
 * ```
 *   unit.persona ──personaOf──► fallback ── a tag ──────────────► that tag
 *        │                                └─ "species" / unknown ─┐
 *   unit.sourceId ──speciesOf──► species.behaviour ◄──────────────┘
 * ```
 *
 * @param unit - The bug: its species id and, when named, its persona.
 * @param speciesOf - Resolves `sourceId` to its species.
 * @param personaOf - Resolves a persona; absent, every bug plays its species.
 * @returns The tag, or undefined for a species the catalogue lacks.
 */
export function behaviourTagOf(
  unit: Pick<Unit, "sourceId" | "persona">,
  speciesOf: SpeciesLookup,
  personaOf?: PersonaLookup,
): BehaviourTag | undefined {
  const fallback =
    unit.persona === undefined
      ? undefined
      : personaOf?.(unit.persona)?.fallback;
  if (fallback !== undefined && fallback !== SPECIES_FALLBACK) {
    return fallback;
  }
  return speciesOf(unit.sourceId)?.behaviour;
}

/**
 * The commands a bug should issue this turn: its behaviour, looked up
 * through the registry by `behaviourTagOf` (a named enemy's persona
 * fallback, else its species' tag), asked to choose. A unit that is not
 * a living bug, a species the catalogue lacks, or a tag with no
 * behaviour yet all yield no commands, so an unfinished species holds
 * still rather than crashing the phase.
 */
export function chooseBugCommands(
  view: MissionView,
  unitId: UnitId,
  registry: BehaviourLookup,
  speciesOf: SpeciesLookup,
  ctx: BehaviourContext,
  personaOf?: PersonaLookup,
): readonly TacticalCommand[] {
  const unit = view.units.find((u) => u.id === unitId);
  if (unit?.kind !== "bug" || unit.hp <= 0) {
    return [];
  }
  const tag = behaviourTagOf(unit, speciesOf, personaOf);
  if (tag === undefined) {
    return [];
  }
  return registry.get(tag)?.choose(view, unitId, ctx) ?? [];
}

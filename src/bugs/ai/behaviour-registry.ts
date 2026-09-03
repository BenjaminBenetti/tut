import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
import type { BehaviourTag, BugSpecies } from "../model/bug-species";
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
 * The commands a bug should issue this turn: its species' behaviour,
 * looked up through the registry, asked to choose. A unit that is not a
 * living bug, a species the catalogue lacks, or a tag with no behaviour
 * yet all yield no commands, so an unfinished species holds still
 * rather than crashing the phase.
 */
export function chooseBugCommands(
  mission: TacticalState,
  unitId: UnitId,
  registry: BehaviourLookup,
  speciesOf: SpeciesLookup,
  ctx: BehaviourContext,
): readonly TacticalCommand[] {
  const unit = mission.units.find((u) => u.id === unitId);
  if (unit?.kind !== "bug" || unit.hp <= 0) {
    return [];
  }
  const tag = speciesOf(unit.sourceId)?.behaviour;
  if (tag === undefined) {
    return [];
  }
  return registry.get(tag)?.choose(mission, unitId, ctx) ?? [];
}

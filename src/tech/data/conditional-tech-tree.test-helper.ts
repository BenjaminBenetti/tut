import type { TechConditions } from "../model/tech-conditions";
import type { TechFamily, TechNode } from "../model/tech-node";
import { StaticTechCatalogue } from "../repository/static-tech-catalogue";
import { TECH_FAMILIES } from "./tech-families";

// ===========================================
// Ids
// ===========================================

/** A plain tier 2 part node: always visible. */
export const FX_JUMP_JETS = "tech.fx-jump-jets";
/** A tier 3 part node behind `FX_JUMP_JETS`. */
export const FX_SPRINT_FRAME = "tech.fx-sprint-frame";
/** A visible story node whose only effect is a flag. */
export const FX_FIELD_NOTES = "tech.fx-field-notes";
/** A visible infantry node: an infantry upgrade. */
export const FX_SQUAD_ARMOUR = "tech.fx-squad-armour";
/** A tier 3 infantry node behind `FX_SQUAD_ARMOUR`: a squad type. */
export const FX_HEAVY_WEAPONS = "tech.fx-heavy-weapons";
/** A hidden intel node: needs the spore sample, grants the capture net. */
export const FX_PHEROMONE_ANALYSIS = "tech.fx-pheromone-analysis";
/** A hidden tier 3 intel node behind `FX_PHEROMONE_ANALYSIS`, needing a second flag too. */
export const FX_POD_TELEMETRY = "tech.fx-pod-telemetry";

/** The flag that reveals `FX_PHEROMONE_ANALYSIS`. */
export const SPORE_SAMPLE = "spore-sample";
/** The second flag `FX_POD_TELEMETRY` needs. */
export const HIVE_CORE_SAMPLE = "hive-core-sample";
/** The flag `FX_PHEROMONE_ANALYSIS` sets. */
export const CAPTURE_NET = "capture-net";

// ===========================================
// Tree
// ===========================================

/**
 * A small tree with one of every kind of node ADR 0013 §2.7 adds, for
 * the status, unlock, layout and screen tests. The energy family holds
 * only the two hidden intel nodes, so with no flags it has nothing to
 * show.
 *
 * ```
 *   family       tier 2                       tier 3
 *   mobility     Jump Jets (part)             Sprint Frame (part)
 *   protection   Squad Armour (infantry)      Heavy Weapons (infantry, squad type)
 *   energy       Pheromone Analysis (intel,   Pod Telemetry (intel, hidden
 *                hidden until spore-sample)   until spore-sample + hive-core-sample)
 *   support      Field Notes (story, flag)
 * ```
 */
export const CONDITIONAL_TECH_NODES: readonly TechNode[] = [
  {
    id: FX_JUMP_JETS,
    name: "Jump Jets",
    description: "Jumper legs.",
    family: "mobility",
    kind: "part",
    tier: 2,
    cost: 18,
    requires: [],
    effects: [{ kind: "part", partId: "legs-jumper" }],
  },
  {
    id: FX_SPRINT_FRAME,
    name: "Sprint Frame",
    description: "Sprint legs.",
    family: "mobility",
    kind: "part",
    tier: 3,
    cost: 40,
    requires: [FX_JUMP_JETS],
    effects: [{ kind: "part", partId: "legs-sprint" }],
  },
  {
    id: FX_SQUAD_ARMOUR,
    name: "Squad Armour",
    description: "Better vests for every squad.",
    family: "protection",
    kind: "infantry",
    tier: 2,
    cost: 30,
    requires: [],
    effects: [{ kind: "infantry-upgrade", upgradeId: "squad-armour-1" }],
  },
  {
    id: FX_HEAVY_WEAPONS,
    name: "Heavy Weapons",
    description: "A new squad type.",
    family: "protection",
    kind: "infantry",
    tier: 3,
    cost: 45,
    requires: [FX_SQUAD_ARMOUR],
    effects: [{ kind: "squad-type", squadTypeId: "heavy-weapons" }],
  },
  {
    id: FX_PHEROMONE_ANALYSIS,
    name: "Pheromone Analysis",
    description: "What the spore sample says.",
    family: "energy",
    kind: "intel",
    tier: 2,
    cost: 180,
    requires: [],
    requiresFlags: [SPORE_SAMPLE],
    effects: [{ kind: "flag", flag: CAPTURE_NET }],
  },
  {
    id: FX_POD_TELEMETRY,
    name: "Pod Telemetry",
    description: "Where the pods go.",
    family: "energy",
    kind: "intel",
    tier: 3,
    cost: 240,
    requires: [FX_PHEROMONE_ANALYSIS],
    requiresFlags: [SPORE_SAMPLE, HIVE_CORE_SAMPLE],
    effects: [{ kind: "flag", flag: "pod-telemetry" }],
  },
  {
    id: FX_FIELD_NOTES,
    name: "Field Notes",
    description: "A flag and nothing else.",
    family: "support",
    kind: "story",
    tier: 2,
    cost: 25,
    requires: [],
    effects: [{ kind: "flag", flag: "field-notes" }],
  },
];

/** The four families the fixture tree uses, in draw order. */
export const CONDITIONAL_TECH_FAMILIES: readonly TechFamily[] = [
  TECH_FAMILIES.mobility,
  TECH_FAMILIES.protection,
  TECH_FAMILIES.energy,
  TECH_FAMILIES.support,
];

/** A catalogue over the fixture tree. */
export function conditionalTechCatalogue(): StaticTechCatalogue {
  return new StaticTechCatalogue(
    CONDITIONAL_TECH_NODES,
    CONDITIONAL_TECH_FAMILIES,
  );
}

/** Conditions holding exactly `flags`. */
export function withFlags(...flags: string[]): TechConditions {
  return { flags: new Set(flags) };
}

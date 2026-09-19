import type { TechNode } from "../model/tech-node";

// ===========================================
// Costs
// ===========================================
//
// Pacing (#1171): the whole tree should be bought out by about the 25th
// tactical mission. With infestation clearance paying a base of 8 tech
// points plus 3 per point of difficulty, a campaign that ramps from
// difficulty 2 to 8 banks roughly 575 over 25 missions, and the tech
// carcasses that show up on about a third of maps add about 175 more.
// Sixteen tier 2 nodes at 18 and eleven tier 3 nodes at 40 come to 728,
// so a player who harvests what they find clears the tree a mission or
// two early and one who never does finishes a few missions late. The
// data test holds the total against that model.

/** Tech points a tier 2 node costs. */
export const TIER_2_COST = 18;
/** Tech points a tier 3 node costs. */
export const TIER_3_COST = 40;

// ===========================================
// Nodes
// ===========================================

/**
 * The tech tree: every tier 2 and tier 3 part of the catalogue, filed
 * under the six research families of `docs/design/mech-roster.md`. Tier
 * 2 nodes have no prerequisites, so every family opens at once and the
 * first unlock is a real choice; each tier 3 node needs one tier 2 node
 * of its family, so a capital system is reached by building up to it.
 *
 * ```
 *   family        tier 2                          tier 3
 *   mobility      Jump Jets · All-Terrain         Sprint Frame
 *   protection    Composite · Assault Arms        Ablative · Anchor
 *   ballistics    Heavy Autocannon · Railgun      Siege Railgun
 *   energy        Thermal Lance · High Output     Beam · Crucible · Cooling
 *   fire support  Atlas · Guided · Incendiary ·   Howitzer · Cluster
 *                 Rotary
 *   support       Tracker · Surveyor · Recon ·    Marksman · Designator
 *                 Field Repair
 * ```
 */
export const TECH_NODES: readonly TechNode[] = [
  // ---- Mobility ----
  {
    id: "tech.jump-jets",
    name: "Jump Jets",
    description: "Jumper legs: long jumps over obstacles and onto flat roofs.",
    family: "mobility",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["legs-jumper"],
  },
  {
    id: "tech.all-terrain",
    name: "All-Terrain Actuators",
    description:
      "All-Terrain legs: rough ground costs a mech no more than a street.",
    family: "mobility",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["legs-all-terrain"],
  },
  {
    id: "tech.sprint-frame",
    name: "Sprint Frame",
    description:
      "Sprint legs: the fastest frame in the catalogue, fragile and hot.",
    family: "mobility",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.all-terrain"],
    unlocks: ["legs-sprint"],
  },
  // ---- Protection ----
  {
    id: "tech.composite-plating",
    name: "Composite Plating",
    description: "Composite plating: more protection per tonne than steel.",
    family: "protection",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["utility-composite-plating"],
  },
  {
    id: "tech.assault-arms",
    name: "Assault Arms",
    description: "Assault arms: protected, responsive mounts for close work.",
    family: "protection",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["arms-assault"],
  },
  {
    id: "tech.ablative-armour",
    name: "Ablative Armour",
    description:
      "Ablative armour: shrugs off the first three hits of a mission.",
    family: "protection",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.composite-plating"],
    unlocks: ["utility-ablative-armor"],
  },
  {
    id: "tech.anchor-legs",
    name: "Anchor Stabilisers",
    description: "Anchor legs: deployable spades that steady heavy weapons.",
    family: "protection",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.assault-arms"],
    unlocks: ["legs-anchor"],
  },
  // ---- Ballistics ----
  {
    id: "tech.heavy-autocannon",
    name: "Heavy Autocannon",
    description: "Heavy autocannon: more shell, more damage, less finesse.",
    family: "ballistics",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["arm-weapon-heavy-autocannon"],
  },
  {
    id: "tech.railgun",
    name: "Railgun",
    description: "Railgun: long-range anti-armour fire for a hungry reactor.",
    family: "ballistics",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["arm-weapon-railgun"],
  },
  {
    id: "tech.siege-railgun",
    name: "Siege Railgun",
    description:
      "Siege railgun: opens walls and armour alike, at enormous cost.",
    family: "ballistics",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.railgun"],
    unlocks: ["arm-weapon-siege-railgun"],
  },
  // ---- Energy ----
  {
    id: "tech.thermal-lance",
    name: "Thermal Lance",
    description:
      "Thermal lance: a short piercing beam through everything in a line.",
    family: "energy",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["arm-weapon-thermal-lance"],
  },
  {
    id: "tech.high-output-reactor",
    name: "High-Output Reactor",
    description: "High-output generator: the power demanding equipment needs.",
    family: "energy",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["utility-high-output-generator"],
  },
  {
    id: "tech.beam-projector",
    name: "Beam Projector",
    description:
      "Beam projector: a long lane of damage and a dangerous firing line.",
    family: "energy",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.thermal-lance"],
    unlocks: ["arm-weapon-beam-projector"],
  },
  {
    id: "tech.crucible-chassis",
    name: "Crucible Chassis",
    description:
      "Crucible: the frame with the best sustained cooling in the catalogue.",
    family: "energy",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.high-output-reactor"],
    unlocks: ["chassis-crucible"],
  },
  {
    id: "tech.advanced-cooling",
    name: "Advanced Cooling",
    description:
      "Active heat exchanger, emergency coolant injector and conduit arms: run hotter, longer.",
    family: "energy",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.high-output-reactor"],
    unlocks: [
      "utility-active-heat-exchanger",
      "utility-emergency-coolant-injector",
      "arms-conduit",
    ],
  },
  // ---- Fire support ----
  {
    id: "tech.atlas-chassis",
    name: "Atlas Chassis",
    description:
      "Atlas: the heaviest payload and the most utility slots of any frame.",
    family: "fire-support",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["chassis-atlas"],
  },
  {
    id: "tech.guided-missiles",
    name: "Guided Missiles",
    description:
      "Guided missile rack: one accurate strike on one armoured target.",
    family: "fire-support",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["back-weapon-guided-missile-rack"],
  },
  {
    id: "tech.incendiary-launcher",
    name: "Incendiary Launcher",
    description: "Incendiary launcher: burning ground at range.",
    family: "fire-support",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["back-weapon-incendiary-launcher"],
  },
  {
    id: "tech.rotary-cannon",
    name: "Rotary Cannon",
    description: "Rotary cannon: heavy, hot and devastating at short range.",
    family: "fire-support",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["back-weapon-rotary-cannon"],
  },
  {
    id: "tech.siege-howitzer",
    name: "Siege Howitzer",
    description: "Siege howitzer: braced bombardment that brings walls down.",
    family: "fire-support",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.guided-missiles"],
    unlocks: ["back-weapon-siege-howitzer"],
  },
  {
    id: "tech.cluster-rockets",
    name: "Cluster Rockets",
    description:
      "Cluster rocket rack: broad coverage against a dispersed swarm.",
    family: "fire-support",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.incendiary-launcher"],
    unlocks: ["back-weapon-cluster-rocket-rack"],
  },
  // ---- Support ----
  {
    id: "tech.tracker-arms",
    name: "Tracker Arms",
    description: "Tracker arms: accuracy for every weapon, at a power cost.",
    family: "support",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["arms-tracker"],
  },
  {
    id: "tech.surveyor-chassis",
    name: "Surveyor Chassis",
    description: "Surveyor: the frame that sees furthest.",
    family: "support",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["chassis-surveyor"],
  },
  {
    id: "tech.recon-sensor",
    name: "Recon Sensor",
    description:
      "Recon sensor: beacons that scan for contacts ahead of the line.",
    family: "support",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["utility-recon-sensor"],
  },
  {
    id: "tech.field-repair",
    name: "Field Repair",
    description: "Field repair module: patches nearby mechs mid-mission.",
    family: "support",
    tier: 2,
    cost: TIER_2_COST,
    requires: [],
    unlocks: ["utility-field-repair-module"],
  },
  {
    id: "tech.marksman-arms",
    name: "Marksman Arms",
    description:
      "Marksman arms: the strongest stationary accuracy bonus there is.",
    family: "support",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.tracker-arms"],
    unlocks: ["arms-marksman"],
  },
  {
    id: "tech.target-designator",
    name: "Target Designator",
    description:
      "Target designator: paints a target for every guided weapon on the field.",
    family: "support",
    tier: 3,
    cost: TIER_3_COST,
    requires: ["tech.recon-sensor"],
    unlocks: ["utility-target-designator"],
  },
];

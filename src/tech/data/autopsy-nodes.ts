import { killedFlag } from "../model/tech-conditions";
import type { TechNode } from "../model/tech-node";

// ===========================================
// Costs
// ===========================================
//
// Five autopsies at 20–40 TP each (campaign arc §10.2), 100–200 TP in
// all, inside the whole-tree budget the infantry branch works out
// (`infantry-tech-tree.ts`). An autopsy is cheaper than the tier 2 part
// node of a general part plus a few points: it answers one species,
// and the first kill that reveals it is when that species starts to
// matter. The later, tougher species cost more.
//
//   Spitter Autopsy      25   (Act I, from mission 8)
//   Hive Guard Autopsy   35   (Act II–III, hive assaults)
//                        ──
//                        60 TP of the 100–200

/** Spitter Autopsy: the first autopsy most campaigns reach. */
const SPITTER_AUTOPSY_COST = 25;
/** Hive Guard Autopsy: a hive-assault species, dearer than the spitter. */
const HIVE_GUARD_AUTOPSY_COST = 35;

// ===========================================
// Nodes
// ===========================================

/**
 * The autopsies of the tech tree (campaign arc §8, §10.2): one node per
 * bug species, hidden until the campaign's first kill of that species
 * (`requiresFlags: [killedFlag(species)]`, ADR 0013 §2.7), each
 * unlocking the one mech part that counters the species. They sit in
 * the xenobiology family, which the tree draws only once one of them
 * is visible, and on its inner ring, with no prerequisites: the kill is
 * the only gate.
 *
 * ```
 *   first kill ──► progress.speciesKilled ──► "killed:<species>" flag
 *     ──► the autopsy shows ──► researched ──► its counter part can be bought
 * ```
 *
 * How a species package adds its autopsy (one node, one part, one tag):
 *
 * 1. **Node**: append an entry here, `kind: "autopsy"`, family
 *    `xenobiology`, tier 2, 20–40 TP, `requiresFlags:
 *    [killedFlag("<species id>")]` and exactly one part effect. The
 *    flag needs no wiring: the launch handler records the species on
 *    its first kill and `campaignTechConditions` turns it into the flag.
 * 2. **Part**: append the counter to `roster/data/autopsy-parts.ts`,
 *    tier 2, usually a `traits.resist` against the species' tag.
 * 3. **Tag**: when the species brings a new kind of hit, add a member to
 *    `DamageTag` and `DAMAGE_TAGS` (`content/model/damage-tag.ts`) and
 *    list it in the species' `weapon.tags`. The tag is its own label:
 *    the stat sheet and the tech tree print it as it is spelled.
 *
 * The data test (`autopsy-nodes.test.ts`) holds every entry to these
 * rules, and that each species has at most one autopsy.
 */
export const AUTOPSY_NODES: readonly TechNode[] = [
  {
    id: "tech.spitter-autopsy",
    name: "Spitter Autopsy",
    description:
      "Dissect a spitter's acid sac and seal our plate against what it throws.",
    family: "xenobiology",
    kind: "autopsy",
    tier: 2,
    cost: SPITTER_AUTOPSY_COST,
    requires: [],
    requiresFlags: [killedFlag("spitter")],
    effects: [{ kind: "part", partId: "utility-acid-resistant-plating" }],
  },
  {
    id: "tech.hive-guard-autopsy",
    name: "Hive Guard Autopsy",
    description:
      "Cut open a Hive Guard's shield plate and learn to layer our own against its spines.",
    family: "xenobiology",
    kind: "autopsy",
    tier: 2,
    cost: HIVE_GUARD_AUTOPSY_COST,
    requires: [],
    requiresFlags: [killedFlag("hive-guard")],
    effects: [{ kind: "part", partId: "utility-spine-plate-armour" }],
  },
];

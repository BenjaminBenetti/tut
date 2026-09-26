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
//   Spitter Autopsy             25   (Act I, from mission 8)
//   Burrower Autopsy            30   (Act II, from mission 20)
//   Hive Guard Autopsy          35   (Act II–III, hive assaults)
//   Broodmother Autopsy         40   (Act II, Alpha Hunt)
//   Armoured Carapace Autopsy   40   (Act III, any armoured variant)
//                               ───
//                               170 TP of the 100–200
//
// The burrower's sits under the Hive Guard's though it comes later: its
// counter is warning, not plate. The Broodmother's and the carapace's
// top the band: one is a boss, the other answers Act III's plate.

/** Spitter Autopsy: the first autopsy most campaigns reach. */
const SPITTER_AUTOPSY_COST = 25;
/** Hive Guard Autopsy: a hive-assault species, dearer than the spitter. */
const HIVE_GUARD_AUTOPSY_COST = 35;
/** Burrower Autopsy: an Act II species whose counter is intel, not plate. */
const BURROWER_AUTOPSY_COST = 30;
/** Broodmother Autopsy: the Alpha Hunt's boss, top of the band. */
const BROODMOTHER_AUTOPSY_COST = 40;
/** Armoured Carapace Autopsy: Act III's plate, top of the band. */
const ARMOURED_AUTOPSY_COST = 40;

// ===========================================
// Nodes
// ===========================================

/**
 * The autopsies of the tech tree (campaign arc §8, §10.2): one node per
 * bug species, hidden until the campaign's first kill of that species
 * (`requiresFlags: [killedFlag(species)]`, ADR 0013 §2.7), each
 * unlocking the one mech part that counters the species. The armoured
 * variants share one, the armoured carapace: its flag names the kill
 * group (`killedFlag("armoured-carapace")`), which the first kill of
 * any of the three sets. They sit in
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
 *    For one autopsy over several species, name a kill group instead
 *    (`KillGroupId`, `bugs/data/kill-groups.ts`).
 * 2. **Part**: append the counter to `roster/data/autopsy-parts.ts`,
 *    tier 2, usually a `traits.resist` against the species' tag.
 * 3. **Tag**: when the species brings a new kind of hit, add a member to
 *    `DamageTag` and `DAMAGE_TAGS` (`content/model/damage-tag.ts`) and
 *    list it in the species' `weapon.tags`. The tag is its own label:
 *    the stat sheet and the tech tree print it as it is spelled.
 *
 * The data test (`autopsy-nodes.test.ts`) holds every entry to these
 * rules, and that each species or group has at most one autopsy.
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
  {
    id: "tech.burrower-autopsy",
    name: "Burrower Autopsy",
    description:
      "Open a burrower's digging limbs and tune geophones to the sound they make underground.",
    family: "xenobiology",
    kind: "autopsy",
    tier: 2,
    cost: BURROWER_AUTOPSY_COST,
    requires: [],
    requiresFlags: [killedFlag("burrower")],
    effects: [{ kind: "part", partId: "utility-seismic-sensor" }],
  },
  {
    id: "tech.broodmother-autopsy",
    name: "Broodmother Autopsy",
    description:
      "Take apart the Broodmother's bone cage and fit its plate to a mech, proof against her brood.",
    family: "xenobiology",
    kind: "autopsy",
    tier: 2,
    cost: BROODMOTHER_AUTOPSY_COST,
    requires: [],
    requiresFlags: [killedFlag("broodmother")],
    effects: [{ kind: "part", partId: "utility-matriarch-chitin" }],
  },
  {
    id: "tech.armoured-autopsy",
    name: "Armoured Carapace Autopsy",
    description:
      "Section an armoured bug's slab plate and core our rounds to punch through it.",
    family: "xenobiology",
    kind: "autopsy",
    tier: 2,
    cost: ARMOURED_AUTOPSY_COST,
    requires: [],
    requiresFlags: [killedFlag("armoured-carapace")],
    effects: [{ kind: "part", partId: "utility-armour-piercing-rounds" }],
  },
];

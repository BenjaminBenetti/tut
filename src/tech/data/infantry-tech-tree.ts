import type { TechNode } from "../model/tech-node";

// ===========================================
// Costs
// ===========================================
//
// The infantry branch (campaign arc §10.3, D8) is priced against the
// part tiers (18 and 40) and the whole-tree budget of §10. An upgrade
// reaches every squad, hired now or later, and costs no credits once
// researched, where a part node only makes one part purchasable, so a
// rung costs a little more than the part tier it sits on: 25–30 on the
// inner ring, 50–70 on the outer. The heavy weapons squad is the dearest
// because it is a new type rather than a better one.
//
//   inner ring (tier 2)             outer ring (tier 3)
//   Squad Armour I          30  ──► Squad Armour II          60
//                               └─► Heavy Weapons Infantry   70
//   Frag Grenades           25  ──► Incendiary Grenades      50
//   Field Medic Training    30
//                                                   family  265 TP
//
// Budget (§10): a 50-mission campaign earns about 1,400–1,500 TP and the
// whole tree should cost 1.3–1.6× that, 1,820–2,400. The 728 TP of part
// nodes, these 265, the Intel projects (about 650–700), Last Hope (about
// 100) and five autopsies (100–200) come to about 1,850–2,000, the low
// end of the band, with room for capstones.

/** Squad Armour I: the family's first armour rung. */
const SQUAD_ARMOUR_1_COST = 30;
/** Squad Armour II: the second rung of plate. */
const SQUAD_ARMOUR_2_COST = 60;
/** Frag Grenades: the cheapest rung, a better grenade. */
const FRAG_GRENADES_COST = 25;
/** Incendiary Grenades: the grenade ladder's top rung. */
const INCENDIARY_GRENADES_COST = 50;
/** Field Medic Training: a stronger medkit for the medic squad. */
const FIELD_MEDIC_TRAINING_COST = 30;
/** Heavy Weapons Infantry: a new squad type. */
const HEAVY_WEAPONS_COST = 70;

// ===========================================
// Nodes
// ===========================================

/**
 * The infantry family of the tech tree (campaign arc §10.3): five
 * upgrades that reach every squad and one new squad type, as
 * `kind: "infantry"` nodes with their own prices. Always visible. The
 * inner ring opens at once, and each outer rung needs the inner one it
 * builds on: the second plate the first, the incendiary the frag
 * grenade, and the heavy weapons squad the first plate its crews wear.
 *
 * ```
 *   Squad Armour I ─────┬──► Squad Armour II
 *                       └──► Heavy Weapons Infantry
 *   Frag Grenades ─────────► Incendiary Grenades
 *   Field Medic Training
 * ```
 *
 * What each upgrade does is `roster/data/infantry-upgrades.ts`; the
 * squad type is `roster/data/squad-types.ts`.
 */
export const INFANTRY_TECH_NODES: readonly TechNode[] = [
  {
    id: "tech.squad-armour-1",
    name: "Squad Armour I",
    description:
      "Ceramic plates in every vest: +1 armour on every squad, hired now or later.",
    family: "infantry",
    kind: "infantry",
    tier: 2,
    cost: SQUAD_ARMOUR_1_COST,
    requires: [],
    effects: [{ kind: "infantry-upgrade", upgradeId: "squad-armour-1" }],
  },
  {
    id: "tech.frag-grenades",
    name: "Frag Grenades",
    description:
      "Fragmentation sleeves on every grenade: 8 damage in place of 6, and more of it reaches the edge of the blast.",
    family: "infantry",
    kind: "infantry",
    tier: 2,
    cost: FRAG_GRENADES_COST,
    requires: [],
    effects: [{ kind: "infantry-upgrade", upgradeId: "frag-grenades" }],
  },
  {
    id: "tech.field-medic-training",
    name: "Field Medic Training",
    description:
      "Trauma training for the medic squad: its medkit mends 15 hit points in place of 10.",
    family: "infantry",
    kind: "infantry",
    tier: 2,
    cost: FIELD_MEDIC_TRAINING_COST,
    requires: [],
    effects: [{ kind: "infantry-upgrade", upgradeId: "field-medic-training" }],
  },
  {
    id: "tech.squad-armour-2",
    name: "Squad Armour II",
    description:
      "A second layer of plate: +1 more armour on every squad, +2 in all, so a lurker's claws start to glance off.",
    family: "infantry",
    kind: "infantry",
    tier: 3,
    cost: SQUAD_ARMOUR_2_COST,
    requires: ["tech.squad-armour-1"],
    effects: [{ kind: "infantry-upgrade", upgradeId: "squad-armour-2" }],
  },
  {
    id: "tech.heavy-weapons",
    name: "Heavy Weapons Infantry",
    description:
      "Opens the Heavy Weapons Squad for hire: a crew-served machine gun, two bursts a turn out to ten tiles.",
    family: "infantry",
    kind: "infantry",
    tier: 3,
    cost: HEAVY_WEAPONS_COST,
    requires: ["tech.squad-armour-1"],
    effects: [{ kind: "squad-type", squadTypeId: "heavy-weapons" }],
  },
  {
    id: "tech.incendiary-grenades",
    name: "Incendiary Grenades",
    description:
      "Every grenade becomes an incendiary: the frag grenade's blast, and the ground it hits burns for two rounds. Mind your own squads.",
    family: "infantry",
    kind: "infantry",
    tier: 3,
    cost: INCENDIARY_GRENADES_COST,
    requires: ["tech.frag-grenades"],
    effects: [{ kind: "infantry-upgrade", upgradeId: "incendiary-grenades" }],
  },
];

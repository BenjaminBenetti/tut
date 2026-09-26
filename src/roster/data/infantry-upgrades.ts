import type {
  InfantryUpgradeDefinition,
  InfantryUpgradeId,
} from "../model/infantry-upgrade";
import {
  FIELD_MEDKIT,
  FRAG_GRENADE,
  GRENADE,
  INCENDIARY_GRENADE,
  MEDKIT,
} from "../../tactical/data/equipment";

// ===========================================
// Infantry upgrades (campaign arc §10.3, D8)
// ===========================================
//
// What the infantry branch of the tech tree does to every squad. Each
// is granted by one `kind: "infantry"` node (`tech/data/tech-tree.ts`)
// and applied at mission start to every squad deployed, so a squad
// hired after the research has it too.
//
//   | upgrade              | effect on every squad                        |
//   |----------------------|----------------------------------------------|
//   | Squad armour I       | +1 per-hit armour                            |
//   | Squad armour II      | +1 more, +2 in all                           |
//   | Frag grenades        | grenade → frag grenade (8 damage, less falloff) |
//   | Incendiary grenades  | grenade → incendiary grenade (frag + fire)   |
//   | Field medic training | medkit → field medkit (mends 15, not 10)     |
//
// Armour is flat and comes off after penetration, so +1 takes a swarmer's
// bite from 2–4 to 1–3 and +2 to 1–2, and +2 is the first plate a
// lurker's claws (penetration 1) notice. Fire (penetration 2) and a
// brute's cleavers (2) go straight through both. The items are in
// `tactical/data/equipment.ts`; incendiary grenades replace the frag
// grenade too, so the ladder holds whichever order the nodes are read.

/** Every infantry upgrade keyed by id. */
export const INFANTRY_UPGRADES: Readonly<
  Record<InfantryUpgradeId, InfantryUpgradeDefinition>
> = {
  "squad-armour-1": {
    id: "squad-armour-1",
    name: "Squad armour I",
    summary: "+1 armour on every squad",
    armorBonus: 1,
  },
  "squad-armour-2": {
    id: "squad-armour-2",
    name: "Squad armour II",
    summary: "+1 more armour on every squad, +2 in all",
    armorBonus: 1,
  },
  "frag-grenades": {
    id: "frag-grenades",
    name: "Frag grenades",
    summary: "grenades hit for 8 and lose less to the edge",
    equipmentSwaps: { [GRENADE.id]: FRAG_GRENADE.id },
  },
  "incendiary-grenades": {
    id: "incendiary-grenades",
    name: "Incendiary grenades",
    summary: "frag grenades that leave the blast burning",
    equipmentSwaps: {
      [GRENADE.id]: INCENDIARY_GRENADE.id,
      [FRAG_GRENADE.id]: INCENDIARY_GRENADE.id,
    },
  },
  "field-medic-training": {
    id: "field-medic-training",
    name: "Field medic training",
    summary: "the medic squad's medkit mends 15, not 10",
    equipmentSwaps: { [MEDKIT.id]: FIELD_MEDKIT.id },
  },
};

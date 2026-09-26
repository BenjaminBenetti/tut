import type { TechFamily, TechFamilyId } from "../model/tech-node";

/**
 * The columns of the tree: the roster guide's six research families
 * and the infantry branch (campaign arc §10.3). Keyed by the closed id
 * so a missing family fails typecheck.
 */
export const TECH_FAMILIES: Readonly<Record<TechFamilyId, TechFamily>> = {
  mobility: {
    id: "mobility",
    name: "Mobility",
    description: "Legs that jump, cross rough ground and outrun the swarm.",
  },
  protection: {
    id: "protection",
    name: "Protection",
    description:
      "Plate, braced arms and stabilisers that keep a mech standing.",
  },
  ballistics: {
    id: "ballistics",
    name: "Ballistics",
    description: "Heavier guns and rail weapons that punch through armour.",
  },
  energy: {
    id: "energy",
    name: "Energy",
    description: "Reactors, cooling and beams that run hot and hit hard.",
  },
  "fire-support": {
    id: "fire-support",
    name: "Fire support",
    description: "Missiles, incendiaries and siege guns that shape the field.",
  },
  support: {
    id: "support",
    name: "Support",
    description:
      "Optics, sensors and repair that make the squad fight smarter.",
  },
  infantry: {
    id: "infantry",
    name: "Infantry",
    description:
      "Armour, grenades, field medicine and heavy weapons for every squad.",
  },
};

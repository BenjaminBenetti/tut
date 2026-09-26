import { SITREP_TUNING } from "../../tactical/data/sitrep-tuning";
import type { SitrepPresentationCatalogue } from "../model/sitrep-presentation";
import { alphaPresentEffect } from "../service/missions/alpha-present-effect";

// ===========================================
// Table
// ===========================================

/**
 * How the briefing and the mission list show each sitrep (campaign arc
 * §11). Each effect is one line in the player's terms. The numbers are
 * the shipped tuning's (`tactical/data/sitrep-tuning.ts`), and a change
 * there wants a change here; Alpha Present's line is built from it, and
 * names the alpha the offer froze.
 */
export const SITREP_PRESENTATION: SitrepPresentationCatalogue = {
  nightfall: {
    name: "Nightfall",
    effect: "Sight −4 for both sides.",
    helpsPlayer: false,
  },
  "spore-fog": {
    name: "Spore Fog",
    effect: "Spore clouds block sight across the map from the start.",
    helpsPlayer: false,
  },
  "city-ablaze": {
    name: "City Ablaze",
    effect: "Fires burn from the start and flare up every three turns.",
    helpsPlayer: false,
  },
  "salvage-rich": {
    name: "Salvage Rich",
    effect: "Two extra tech carcasses to harvest.",
    helpsPlayer: true,
  },
  "local-guides": {
    name: "Local Guides",
    effect: "The map starts explored; bugs stay hidden.",
    helpsPlayer: true,
  },
  "hardened-clutches": {
    name: "Hardened Clutches",
    effect: "Spawners have 50% more hp and each hatch adds a bug.",
    helpsPlayer: false,
  },
  "swarm-tide": {
    name: "Swarm Tide",
    effect: "Edge waves are 50% larger and the first comes a turn early.",
    helpsPlayer: false,
  },
  "dust-off-window": {
    name: "Dust-off Window",
    effect: "The drop ship leaves on a set turn; anyone left is lost.",
    helpsPlayer: false,
    deadline: {
      phrase: "Drop ship leaves",
      turn: (mission) => mission.dustOffTurn,
    },
  },
  "alpha-present": {
    name: "Alpha Present",
    effect: alphaPresentEffect(undefined, SITREP_TUNING.alphaPresent),
    helpsPlayer: false,
    effectFor: (mission) =>
      mission.alpha === undefined
        ? undefined
        : alphaPresentEffect(mission.alpha, SITREP_TUNING.alphaPresent),
  },
};

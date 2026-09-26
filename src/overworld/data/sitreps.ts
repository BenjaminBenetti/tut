import type { SitrepId } from "../../content/model/sitrep-id";
import type { SitrepDefinition } from "../model/sitrep-definition";

// ===========================================
// Constants
// ===========================================

/** The mission the first sitreps appear on (campaign arc §3, §11). */
export const FIRST_SITREP_MISSION = 10;

// ===========================================
// Sitreps
// ===========================================

/**
 * The sitreps the offer roll draws from (campaign arc §11). Keyed by the
 * closed `SitrepId` union, so a new sitrep without a definition fails
 * to compile.
 *
 * ```
 *   sitrep         debut  helps  weight
 *   nightfall      M10           1
 *   spore-fog      M10           1
 *   city-ablaze    M10           1
 *   salvage-rich   M10    yes    1
 *   local-guides   M10    yes    1
 * ```
 *
 * Equal weights: with five debuted, a filled slot is one of the two
 * helping sitreps two times in five. The later four (arc §11) are all
 * hazards, so the share falls toward two in nine as they debut.
 */
export const SITREPS: Readonly<Record<SitrepId, SitrepDefinition>> = {
  nightfall: {
    id: "nightfall",
    debutMission: FIRST_SITREP_MISSION,
    helpsPlayer: false,
    weight: 1,
  },
  "spore-fog": {
    id: "spore-fog",
    debutMission: FIRST_SITREP_MISSION,
    helpsPlayer: false,
    weight: 1,
  },
  "city-ablaze": {
    id: "city-ablaze",
    debutMission: FIRST_SITREP_MISSION,
    helpsPlayer: false,
    weight: 1,
  },
  "salvage-rich": {
    id: "salvage-rich",
    debutMission: FIRST_SITREP_MISSION,
    helpsPlayer: true,
    weight: 1,
  },
  "local-guides": {
    id: "local-guides",
    debutMission: FIRST_SITREP_MISSION,
    helpsPlayer: true,
    weight: 1,
  },
};

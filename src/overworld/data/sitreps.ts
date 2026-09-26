import type { SitrepId } from "../../content/model/sitrep-id";
import type { SitrepDefinition } from "../model/sitrep-definition";

// ===========================================
// Constants
// ===========================================

/** The mission the first sitreps appear on (campaign arc §3, §11). */
export const FIRST_SITREP_MISSION = 10;

/** The mission Hardened Clutches and Swarm Tide appear from (arc §11). */
export const SPAWN_SITREP_MISSION = 16;

/** The mission Dust-off Window appears from (arc §11). */
export const DUST_OFF_SITREP_MISSION = 20;

// ===========================================
// Sitreps
// ===========================================

/**
 * The sitreps the offer roll draws from (campaign arc §11). Keyed by the
 * closed `SitrepId` union, so a new sitrep without a definition fails
 * to compile.
 *
 * ```
 *   sitrep             debut  needs         helps  weight
 *   nightfall          M10                  -      1
 *   spore-fog          M10                  -      1
 *   city-ablaze        M10                  -      1
 *   salvage-rich       M10                  yes    1
 *   local-guides       M10                  yes    1
 *   hardened-clutches  M16    egg-spawner   -      1
 *   swarm-tide         M16    edge-spawn    -      1
 *   dust-off-window    M20    extraction    -      1
 * ```
 *
 * Equal weights: with five debuted, a filled slot is one of the two
 * helping sitreps two times in five. The later ones are all hazards, so
 * the share falls to two in seven from M16 and two in eight from M20 on
 * a clearance (two in six on a defence, which has no egg spawners for
 * Hardened Clutches), and toward two in nine once Alpha Present lands.
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
  "hardened-clutches": {
    id: "hardened-clutches",
    debutMission: SPAWN_SITREP_MISSION,
    requiredHooks: ["egg-spawner"],
    helpsPlayer: false,
    weight: 1,
  },
  "swarm-tide": {
    id: "swarm-tide",
    debutMission: SPAWN_SITREP_MISSION,
    requiredHooks: ["edge-spawn"],
    helpsPlayer: false,
    weight: 1,
  },
  "dust-off-window": {
    id: "dust-off-window",
    debutMission: DUST_OFF_SITREP_MISSION,
    requiredHooks: ["extraction"],
    helpsPlayer: false,
    weight: 1,
  },
};

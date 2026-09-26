import { HAZARD_TUNING } from "../../data/hazard-tuning";
import { SITREP_TUNING } from "../../data/sitrep-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { SitrepRules } from "../../model/sitrep-rule";
import { cityAblazeSitrep } from "./city-ablaze-sitrep";
import { dustOffWindowSitrep } from "./dust-off-window-sitrep";
import { hardenedClutchesSitrep } from "./hardened-clutches-sitrep";
import { localGuidesSitrep } from "./local-guides-sitrep";
import { nightfallSitrep } from "./nightfall-sitrep";
import { salvageRichSitrep } from "./salvage-rich-sitrep";
import { sporeFogSitrep } from "./spore-fog-sitrep";
import { swarmTideSitrep } from "./swarm-tide-sitrep";

// ===========================================
// Table
// ===========================================

/**
 * What each sitrep does on the tactical map (campaign arc §11, ADR 0013
 * §2.3), built from the shipped tunings. One module per sitrep beside
 * this file; the table is only the list. A new sitrep is one member in
 * `SitrepId`, one module here and one line in this table, and the
 * compiler names every table still missing it.
 *
 * ```
 *   nightfall          sight            −4 for both sides, floored at 3
 *   spore-fog          setup            smoke clouds on open ground
 *   city-ablaze        setup + phase    blazes, relit every 3 turns
 *   salvage-rich       setup            two more tech carcasses
 *   local-guides       setup            the TDF starts with the map explored
 *   hardened-clutches  setup            egg spawners hp × 1.5, one more bug a hatch
 *   swarm-tide         setup            edge waves × 1.5, the first a turn sooner
 *   dust-off-window    setup + phase    the drop ship leaves after a set turn
 * ```
 */
export const SITREP_RULES: SitrepRules = {
  nightfall: nightfallSitrep(SITREP_TUNING.nightfall),
  "spore-fog": sporeFogSitrep(SITREP_TUNING.sporeFog),
  "city-ablaze": cityAblazeSitrep(SITREP_TUNING.cityAblaze, HAZARD_TUNING),
  "salvage-rich": salvageRichSitrep(SITREP_TUNING.salvageRich),
  "local-guides": localGuidesSitrep(),
  "hardened-clutches": hardenedClutchesSitrep(SITREP_TUNING.hardenedClutches),
  "swarm-tide": swarmTideSitrep(SITREP_TUNING.swarmTide),
  "dust-off-window": dustOffWindowSitrep(
    SITREP_TUNING.dustOffWindow,
    SPAWN_TUNING,
  ),
};

import { INFANTRY_UPGRADES } from "../../roster/data/infantry-upgrades";
import type { TechEffectLabels } from "../model/tech-effect-labels";

/**
 * The shipped names for flag and infantry upgrade effects (ADR 0013
 * §2.7). Each new flag a node grants adds one line to `flags`; an id
 * with no line is shown as its words. Infantry upgrades (campaign arc
 * §10.3), the capture net among them, are named from their own table,
 * name and what it does, so the tree and the barracks never disagree:
 *
 * ```
 *   "squad-armour-1" ──► "Squad armour I (+1 armour on every squad)"
 *
 *   Pheromone Analysis (#1179) unlocks
 *     infantry-upgrade capture-net  ──► "Capture net (…)", from the table
 *     flag capture-net              ──► "The Live Specimen mission"
 * ```
 */
export const TECH_EFFECT_LABELS: TechEffectLabels = {
  flags: {
    // The story pins Live Specimen on this flag (campaign arc §4).
    "capture-net": "The Live Specimen mission",
  },
  infantryUpgrades: Object.fromEntries(
    Object.values(INFANTRY_UPGRADES).map((upgrade) => [
      upgrade.id,
      `${upgrade.name} (${upgrade.summary})`,
    ]),
  ),
};

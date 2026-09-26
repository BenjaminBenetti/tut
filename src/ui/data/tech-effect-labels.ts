import { INFANTRY_UPGRADES } from "../../roster/data/infantry-upgrades";
import type { TechEffectLabels } from "../model/tech-effect-labels";

/**
 * The shipped names for flag and infantry upgrade effects (ADR 0013
 * §2.7). Each new flag a node grants adds one line to `flags`, e.g.
 * `"capture-net": "The capture net"`; until then the detail panel shows
 * the id's words. Infantry upgrades (campaign arc §10.3) are named from
 * their own table, name and what it does, so the tree and the barracks
 * never disagree:
 *
 * ```
 *   "squad-armour-1" ──► "Squad armour I (+1 armour on every squad)"
 * ```
 */
export const TECH_EFFECT_LABELS: TechEffectLabels = {
  flags: {},
  infantryUpgrades: Object.fromEntries(
    Object.values(INFANTRY_UPGRADES).map((upgrade) => [
      upgrade.id,
      `${upgrade.name} (${upgrade.summary})`,
    ]),
  ),
};

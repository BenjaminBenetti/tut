import type { TechEffectLabels } from "../model/tech-effect-labels";

/**
 * The shipped names for flag and infantry upgrade effects (ADR 0013
 * §2.7). Empty until the campaign content that sets flags and upgrades
 * infantry lands: each new flag or upgrade a node grants adds one line
 * here, e.g. `"capture-net": "The capture net"`. Until then the detail
 * panel shows the id's words.
 */
export const TECH_EFFECT_LABELS: TechEffectLabels = {
  flags: {},
  infantryUpgrades: {},
};

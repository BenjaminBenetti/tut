import type { MissionMapRules } from "../../model/mission-map-rule";
import { CRASH_SITE_MAP_RULE } from "./crash-site-map";
import { DEFEND_INSTALLATION_MAP_RULE } from "./defend-installation-map";
import { EVACUATION_MAP_RULE } from "./evacuation-map";
import { INFESTATION_CLEARANCE_MAP_RULE } from "./infestation-clearance-map";
import { WRECK_RECOVERY_MAP_RULE } from "./wreck-recovery-map";

// ===========================================
// Mission map rules (ADR 0013 §2.3)
// ===========================================

/**
 * The map rule of every mission type. Each type's map behaviour lives in
 * its own module beside this one; the table only lists them. A new type
 * is one new `<type-id>-map.ts` and one line here, and the compiler asks
 * for the line.
 *
 * ```
 *   infestation-clearance ─► infestation-clearance-map.ts   settlement
 *   defend-installation   ─► defend-installation-map.ts     settlement + site + generators
 *   crash-site            ─► crash-site-map.ts              crater; First Skyfall's pod near deploy
 *   wreck-recovery        ─► wreck-recovery-map.ts          settlement + a chassis-sized wreck
 *   evacuation            ─► evacuation-map.ts              settlement + one civilian hook per group
 * ```
 */
export const MISSION_MAP_RULES: MissionMapRules = {
  "infestation-clearance": INFESTATION_CLEARANCE_MAP_RULE,
  "defend-installation": DEFEND_INSTALLATION_MAP_RULE,
  "crash-site": CRASH_SITE_MAP_RULE,
  "wreck-recovery": WRECK_RECOVERY_MAP_RULE,
  evacuation: EVACUATION_MAP_RULE,
};

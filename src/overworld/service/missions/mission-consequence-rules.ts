import type { MissionConsequenceRules } from "../../model/mission-consequence-rule";
import { CRASH_SITE_CONSEQUENCE } from "./crash-site-consequence";
import { DEFEND_INSTALLATION_CONSEQUENCE } from "./defend-installation-consequence";
import { EVACUATION_CONSEQUENCE } from "./evacuation-consequence";
import { HIVE_ASSAULT_CONSEQUENCE } from "./hive-assault-consequence";
import { INFESTATION_CLEARANCE_CONSEQUENCE } from "./infestation-clearance-consequence";
import { WRECK_RECOVERY_CONSEQUENCE } from "./wreck-recovery-consequence";

// ===========================================
// The table
// ===========================================

/**
 * What each mission type does to the overworld when offered, played or
 * left to lapse (ADR 0013 §2.3), one module each. This file only lists
 * them; the director asks `onOffered`, the launch handler `onResolved`,
 * the expiry step `onExpired`.
 *
 * ```
 *   infestation-clearance  ──► infestation-clearance-consequence.ts   delta, mop-up under 15; ignore penalty
 *   defend-installation    ──► defend-installation-consequence.ts     delta; ignore penalty
 *   crash-site             ──► crash-site-consequence.ts              landing on offer; erased by a
 *                                                                     wrecked pod, spore sample on the
 *                                                                     first win; +15 otherwise and lapsed
 *   wreck-recovery         ──► wreck-recovery-consequence.ts          the one attempt spent, either way
 *   evacuation             ──► evacuation-consequence.ts              credits per group aboard; stipend
 *                                                                     ×1.5 for 10 days if saved, ×0.9
 *                                                                     for 10 otherwise and lapsed
 *   hive-assault           ──► hive-assault-consequence.ts            delta; won: liberate, core sample; never lapses
 * ```
 *
 * A `Record` over the closed `MissionTypeId` union, so a type added to
 * `MISSION_TYPES` without a rule fails to compile. The composition root
 * passes it to the launch handler and the tick; tests substitute their
 * own.
 */
export const MISSION_CONSEQUENCE_RULES: MissionConsequenceRules = {
  "infestation-clearance": INFESTATION_CLEARANCE_CONSEQUENCE,
  "defend-installation": DEFEND_INSTALLATION_CONSEQUENCE,
  "crash-site": CRASH_SITE_CONSEQUENCE,
  "wreck-recovery": WRECK_RECOVERY_CONSEQUENCE,
  evacuation: EVACUATION_CONSEQUENCE,
  "hive-assault": HIVE_ASSAULT_CONSEQUENCE,
};

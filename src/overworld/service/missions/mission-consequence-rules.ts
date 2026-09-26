import type { MissionConsequenceRules } from "../../model/mission-consequence-rule";
import { DEFEND_INSTALLATION_CONSEQUENCE } from "./defend-installation-consequence";
import { INFESTATION_CLEARANCE_CONSEQUENCE } from "./infestation-clearance-consequence";

// ===========================================
// The table
// ===========================================

/**
 * What each mission type does to the overworld when played or left to
 * lapse (ADR 0013 §2.3), one module each. This file only lists them;
 * the launch handler asks `onResolved`, the expiry step `onExpired`.
 *
 * ```
 *   infestation-clearance  ──► infestation-clearance-consequence.ts   delta, mop-up under 15; ignore penalty
 *   defend-installation    ──► defend-installation-consequence.ts     delta; ignore penalty
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
};

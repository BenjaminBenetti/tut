import type { MissionOfferRules } from "../../model/mission-offer-rule";
import { CRASH_SITE_OFFER } from "./crash-site-offer";
import { DEFEND_INSTALLATION_TRIGGER } from "./defend-installation-trigger";
import { EVACUATION_OFFER } from "./evacuation-offer";
import { INFESTATION_CLEARANCE_OFFER } from "./infestation-clearance-offer";
import { WRECK_RECOVERY_TRIGGER } from "./wreck-recovery-trigger";

// ===========================================
// The table
// ===========================================

/**
 * How each mission type is offered (ADR 0013 §2.3, §2.4), one module
 * each. This file only lists them; the mission director runs the
 * trigger rules and draws the offer rules.
 *
 * ```
 *   infestation-clearance  ──► infestation-clearance-offer.ts    offer: detected city ≥ 20 (≥ 10 in Act I)
 *   defend-installation    ──► defend-installation-trigger.ts    trigger: installed region ≥ 40, rolled
 *   crash-site             ──► crash-site-offer.ts               offer: any free city in a region with a
 *                                                                detected city, from Act I mission 3
 *   wreck-recovery         ──► wreck-recovery-trigger.ts         trigger: a mech lost on a lost mission
 *   evacuation             ──► evacuation-offer.ts               offer: detected city ≥ 25, weighted by
 *                                                                population, from Act I mission 3
 * ```
 *
 * A `Record` over the closed `MissionTypeId` union, so a type added to
 * `MISSION_TYPES` without an entry fails to compile. The composition
 * root passes it to the tick; tests substitute their own. The director
 * visits entries in `MISSION_TYPE_IDS` order, which is part of the
 * determinism contract.
 */
export const MISSION_OFFER_RULES: MissionOfferRules = {
  "infestation-clearance": INFESTATION_CLEARANCE_OFFER,
  "defend-installation": DEFEND_INSTALLATION_TRIGGER,
  "crash-site": CRASH_SITE_OFFER,
  "wreck-recovery": WRECK_RECOVERY_TRIGGER,
  evacuation: EVACUATION_OFFER,
};

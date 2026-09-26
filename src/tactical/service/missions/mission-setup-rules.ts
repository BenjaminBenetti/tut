import type { MissionSetupRules } from "../../model/mission-setup-rule";
import { CRASH_SITE_SETUP } from "./crash-site-setup";
import { DEFEND_INSTALLATION_SETUP } from "./defend-installation-setup";
import { INFESTATION_CLEARANCE_SETUP } from "./infestation-clearance-setup";

// ===========================================
// The table
// ===========================================

/**
 * What each mission type puts on its map at the start (ADR 0013 §2.3),
 * one module each. This file only lists them; the mission start asks
 * the entry for `mission.typeId`.
 *
 * ```
 *   infestation-clearance  ──► infestation-clearance-setup.ts   spawners + destroy-spawner
 *   defend-installation    ──► defend-installation-setup.ts     generators + defend-generators, totalWaves
 *   crash-site             ──► crash-site-setup.ts              spore pod + destroy-pod (turn 8), totalWaves
 * ```
 *
 * A `Record` over the closed `MissionTypeId` union, so a type added to
 * `MISSION_TYPES` without a setup rule fails to compile. The composition
 * root passes it through `MissionStartDeps.setupRules`; tests substitute
 * their own.
 */
export const MISSION_SETUP_RULES: MissionSetupRules = {
  "infestation-clearance": INFESTATION_CLEARANCE_SETUP,
  "defend-installation": DEFEND_INSTALLATION_SETUP,
  "crash-site": CRASH_SITE_SETUP,
};

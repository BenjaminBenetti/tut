import { PLATFORM_ASSAULT_TUNING } from "../../data/platform-assault-tuning";
import { WAVE_PRESSURE_TUNING } from "../../data/wave-pressure-tuning";
import type { MissionSetupRules } from "../../model/mission-setup-rule";
import { ALPHA_HUNT_SETUP } from "./alpha-hunt-setup";
import { CRASH_SITE_SETUP } from "./crash-site-setup";
import { DEFEND_INSTALLATION_SETUP } from "./defend-installation-setup";
import { EVACUATION_SETUP } from "./evacuation-setup";
import { placeCavernBroods } from "../brood-placement-service";
import { withGreatHiveSetup } from "./great-hive-setup";
import { HIVE_ASSAULT_SETUP } from "./hive-assault-setup";
import { INFESTATION_CLEARANCE_SETUP } from "./infestation-clearance-setup";
import { TUNNEL_SABOTAGE_SETUP } from "./tunnel-sabotage-setup";
import { createSporePlatformSetup } from "./spore-platform-setup";
import { withWavePressure } from "./wave-pressure-setup";
import { WRECK_RECOVERY_SETUP } from "./wreck-recovery-setup";

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
 *   wreck-recovery         ──► wreck-recovery-setup.ts          spawners (no objective) + wreck + strip-wreck
 *   evacuation             ──► evacuation-setup.ts              nests (no objective) + civilians + rescue-civilians
 *   hive-assault           ──► hive-assault-setup.ts            core + destroy-hive-core, nests, guards, broods
 *   tunnel-sabotage        ──► tunnel-sabotage-setup.ts         tunnel mouths + seal-tunnels
 *   alpha-hunt             ──► alpha-hunt-setup.ts              spawners (no objective) + Broodmother + kill-broodmother
 *   spore-platform         ──► spore-platform-setup.ts          hull: ring deploy, nests + board-core at the hatch;
 *                                                               core: core + destroy-platform-core, guards, boss
 * ```
 *
 * Defend Installation, Tunnel Sabotage and Wreck Recovery press their
 * edge waves harder than the shared schedule (#1179): each is wrapped
 * in `withWavePressure` with its entry in `WAVE_PRESSURE_TUNING`, so
 * every wave surges (and a wreck's first comes a turn sooner) once the
 * type's own setup has run.
 *
 * A `Record` over the closed `MissionTypeId` union, so a type added to
 * `MISSION_TYPES` without a setup rule fails to compile. The composition
 * root passes it through `MissionStartDeps.setupRules`; tests substitute
 * their own.
 */
export const MISSION_SETUP_RULES: MissionSetupRules = {
  "infestation-clearance": INFESTATION_CLEARANCE_SETUP,
  "defend-installation": withWavePressure(
    DEFEND_INSTALLATION_SETUP,
    WAVE_PRESSURE_TUNING.defence,
  ),
  "crash-site": CRASH_SITE_SETUP,
  "wreck-recovery": withWavePressure(
    WRECK_RECOVERY_SETUP,
    WAVE_PRESSURE_TUNING.wreck,
  ),
  evacuation: EVACUATION_SETUP,
  "hive-assault": withGreatHiveSetup(HIVE_ASSAULT_SETUP, placeCavernBroods),
  "tunnel-sabotage": withWavePressure(
    TUNNEL_SABOTAGE_SETUP,
    WAVE_PRESSURE_TUNING.tunnel,
  ),
  "alpha-hunt": ALPHA_HUNT_SETUP,
  "spore-platform": createSporePlatformSetup(PLATFORM_ASSAULT_TUNING),
};

import type { DeployableTypeId } from "./deployable-type-id";

// ===========================================
// Installation site id
// ===========================================

/**
 * A facility the story asks the squad to defend that the player never
 * builds (campaign arc §6.9): the tracking array of **Uplink** and the
 * launch site of **Launch Window**. Each borrows an authored compound
 * from a deployable (`InstallationSite.compound`) and has its own name.
 */
export type StoryInstallationId = "tracking-array" | "launch-site";

/**
 * Every facility a defend-installation mission (#1175) can be fought
 * over: each installation the player builds, under its deployable id,
 * and each story facility. Shared vocabulary (ADR 0002 §2.1): the offer
 * freezes it in `Mission.defence`, map generation raises its compound,
 * the defend objective and the result carry it, and the briefing, the
 * tracker and the debrief name it from `INSTALLATION_SITES`.
 *
 * ```
 *   InstallationSiteId
 *   ├── DeployableTypeId      sensor-array, bank, …   built by the player
 *   └── StoryInstallationId   tracking-array          Uplink
 *                             launch-site             Launch Window
 * ```
 */
export type InstallationSiteId = DeployableTypeId | StoryInstallationId;

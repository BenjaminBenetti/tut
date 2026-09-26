import type { DeployableTypeId } from "./deployable-type-id";
import type { InstallationSiteId } from "./installation-site-id";

// ===========================================
// Installation site
// ===========================================

/**
 * Cross-domain installation identity, name and generator count (GDD §5.6).
 * `compound` selects an authored mission site in mapgen's injected
 * catalogue; the overworld freezes the generator count into the offer
 * and tactical stands generators on the resulting objective hooks.
 *
 * ```
 *   "sensor-array"    ──compound──► "sensor-array"          its own
 *   "tracking-array"  ──compound──► "sensor-array"          borrowed (Uplink)
 * ```
 */
export interface InstallationSite {
  /** The facility this site stands for; also the key in `INSTALLATION_SITES`. */
  readonly id: InstallationSiteId;
  /** Display name for the briefing and the objective, e.g. `"Sensor array"`. */
  readonly name: string;
  /**
   * Generators around the facility; every one is an objective. Equal to
   * the generator sockets of its `compound`.
   */
  readonly generators: number;
  /**
   * The authored compound map generation raises for the facility: an
   * installation's own, and for a story facility the deployable compound
   * it borrows (campaign arc §6.9), so the story needs no new layout.
   */
  readonly compound: DeployableTypeId;
}

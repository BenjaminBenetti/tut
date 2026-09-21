import type { DeployableTypeId } from "./deployable-type-id";

// ===========================================
// Installation site
// ===========================================

/**
 * Cross-domain installation identity, name and generator count (GDD §5.6).
 * The id selects a composed mission site in mapgen's injected catalogue;
 * the overworld freezes the generator count into the offer and tactical
 * stands generators on the resulting objective hooks.
 */
export interface InstallationSite {
  /** The installation this site stands for; also the key in `INSTALLATION_SITES`. */
  readonly id: DeployableTypeId;
  /** Display name for the briefing and the objective, e.g. `"Sensor array"`. */
  readonly name: string;
  /** Generators around the facility; every one is an objective. */
  readonly generators: number;
}

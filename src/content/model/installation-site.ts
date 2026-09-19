import type { DeployableTypeId } from "./deployable-type-id";

// ===========================================
// Installation site
// ===========================================

/**
 * What a defend-installation mission (#1175) puts on the map for one
 * kind of Earth installation (GDD §5.6): the landmark building map
 * generation raises and the generators around it the player defends.
 * Cross-domain vocabulary: the overworld freezes `generators` into the
 * offer, map generation raises `buildingKind` and places that many
 * generator hooks, the HUD names the site.
 *
 * ```
 *   InstallationSite            mapgen                    tactical
 *   ┌────────────────────┐      ┌────────────────────┐    ┌────────────────┐
 *   │ buildingKind ──────┼─────►│ landmark building  │    │                │
 *   │ generators: 3 ─────┼─────►│ 3 generator hooks ─┼───►│ 3 generators   │
 *   │ name ──────────────┼──────┼────────────────────┼───►│ objective label│
 *   └────────────────────┘      └────────────────────┘    └────────────────┘
 * ```
 */
export interface InstallationSite {
  /** The installation this site stands for; also the key in `INSTALLATION_SITES`. */
  readonly id: DeployableTypeId;
  /** Display name for the briefing and the objective, e.g. `"Sensor array"`. */
  readonly name: string;
  /**
   * Id of the building template map generation raises as the landmark.
   * A plain string in mapgen's vocabulary, as hook kinds are, so content
   * never imports `mapgen/`.
   */
  readonly buildingKind: string;
  /** Generators standing around the landmark; every one is an objective. */
  readonly generators: number;
}

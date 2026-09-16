import type { RegionId } from "../../overworld/model/region";
import { SETTLEMENT_STYLES } from "../data/settlement-styles";
import type {
  SettlementStyleCatalogue,
  SettlementStyleId,
  SettlementStyleSource,
} from "../model/settlement-style";

// ===========================================
// Resolver
// ===========================================

/**
 * Looks a region's settlement style up in a catalogue (#1155), falling
 * back to the catalogue's default for a region it does not list, so a
 * new region on the map still gets a model rather than nothing.
 */
export class SettlementStyleResolver implements SettlementStyleSource {
  private readonly catalogue: SettlementStyleCatalogue;

  /** @param catalogue - Region → style table; defaults to the shipped one. */
  constructor(catalogue: SettlementStyleCatalogue = SETTLEMENT_STYLES) {
    this.catalogue = catalogue;
  }

  /** The style for `regionId`, or the fallback for an unknown region. */
  styleFor(regionId: RegionId): SettlementStyleId {
    return this.catalogue.byRegion[regionId] ?? this.catalogue.fallback;
  }
}

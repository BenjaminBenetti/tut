import type { PassMask } from "../../mapgen/model/pass-mask";
import type { PropKindId } from "../../mapgen/model/prop";
import type { SurfaceId } from "../../mapgen/model/surface";

// ===========================================
// Structure catalogue
// ===========================================

/**
 * What demolition needs to know about the map's content (#1121), as a
 * port: how much force a kind of prop takes to destroy, and who may
 * stand on a surface once whatever stood on it is gone. The mapgen
 * registries satisfy it through `registryStructureCatalogue`; a test
 * satisfies it with two functions.
 *
 * A port rather than the registries themselves, because the rules
 * depend on catalogue interfaces and never on data modules (ADR 0003),
 * and because demolition asks two questions of ten registries.
 */
export interface StructureCatalogue {
  /** Force needed to destroy a prop of this kind, or `undefined` when nothing can. */
  propForce(kind: PropKindId): number | undefined;
  /** Who may stand on a bare tile of this surface. */
  surfacePass(surface: SurfaceId): PassMask;
}

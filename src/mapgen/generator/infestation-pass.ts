import { INFESTATION_TUNING } from "../data/infestation-tuning";
import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import { PassMask } from "../model/pass-mask";
import { infestationFiringRoutes } from "../service/infestation-firing-routes";
import {
  infestationPressure,
  protectedInfestationColumns,
} from "../service/infestation-layout";
import { populateInfestationColonies } from "./infestation/colony-populator";
import { collapseInfestedBuildings } from "./infestation/ruin-builder";

/** Realizes the planned ecology after settlement construction and before connectivity repair. */
export class InfestationPass implements GenerationPass {
  readonly id = "infestation";
  readonly requires: readonly DraftCapability[] = [
    "heightmap",
    "infestation-plan",
    "props",
    "hooks",
  ];
  readonly provides: readonly DraftCapability[] = [];

  /** Invades streets and interiors, breaches buildings and replaces nest clearings with colony cover. */
  run(context: GenerationContext): void {
    const { draft, diagnostics } = context;
    if (draft.infestation === undefined) return;
    const protectedColumns = protectedInfestationColumns(
      draft,
      infestationFiringRoutes(context),
    );
    let patches = 0;
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        if (
          infestationPressure(draft, x, z) <
            INFESTATION_TUNING.growthThreshold ||
          draft.isLandingReserved(x, z) ||
          draft.isSiteReserved(x, z)
        )
          continue;
        const surface = draft.groundSurfaceAt(x, z);
        if (
          context.registries.surfaces.get(surface).defaultPass !== PassMask.ALL
        )
          continue;
        draft.setGroundSurface(x, z, SurfaceIds.INFESTED);
        const interior = draft.getTile(draft.groundCoord(x, z));
        if (
          interior?.floorIndex === 0 &&
          interior.surface !== SurfaceIds.STAIRS
        )
          interior.surface = SurfaceIds.INFESTED;
        patches++;
      }
    }
    // A nest is a replacement land use. Its clearing must not contain the
    // old garden furniture and trees alongside the new organism.
    for (const prop of [...draft.props]) {
      if (
        (prop.occupiedTiles ?? [prop.tile]).some(
          (tile) =>
            (draft.isInfestationReserved(tile.x, tile.z) ||
              (infestationPressure(draft, tile.x, tile.z) > 0.7 &&
                isReclaimedVegetation(prop.kind))) &&
            !draft.isCovered(tile.x, tile.z) &&
            !protectedColumns.has(tile.z * draft.width + tile.x),
        )
      )
        draft.removeProp(prop.id);
    }
    collapseInfestedBuildings(context, protectedColumns);
    const organisms = populateInfestationColonies(context, protectedColumns);
    diagnostics.note(
      `Infestation ${draft.infestation.level}/10: ${patches} invaded tiles, ${organisms} colony structures, ${draft.infestation.ruins.length} breached buildings`,
    );
  }
}

/** Living vegetation gives way to the mature colony's spines and brood structures. */
function isReclaimedVegetation(kind: string): boolean {
  return (
    kind.startsWith("tree-") ||
    kind === PropKindIds.BANKSIA ||
    kind === PropKindIds.GRASS_TREE ||
    kind === PropKindIds.CACTUS
  );
}

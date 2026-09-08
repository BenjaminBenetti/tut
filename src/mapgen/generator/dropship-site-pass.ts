import { DIRECTIONS } from "../../core/model/direction";
import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import { rectContains } from "../../core/service/grid-math";
import { DROPSHIP_SITE_RULES } from "../data/dropship-site";
import { SurfaceIds } from "../data/surfaces";
import { HookKinds } from "../model/hook";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { TileCoord } from "../model/tile-coord";
import {
  dropshipBoardingTiles,
  dropshipFootprint,
  dropshipApproachRect,
} from "../service/dropship-site-layout";
import {
  buildGroundComponents,
  largestGroundComponent,
} from "../service/ground-components";

/** One candidate and the real-ground cuts needed to support it. */
interface SitePlan {
  readonly clearance: Rect;
  readonly facing: Direction;
  readonly level: number;
  readonly cuts: readonly TileCoord[];
  readonly cost: number;
}

/** Reserves a grounded aircraft and external boarding before lots/incidental props. */
export class DropshipSitePass implements GenerationPass {
  readonly id = "dropship-sites";
  readonly requires: readonly DraftCapability[];
  readonly provides: readonly DraftCapability[] = ["landing-sites"];

  /** Settlements reserve after roads; the crash-site prototype reserves after its crater. */
  constructor(after: "roads" | "elevation" = "roads") {
    this.requires = ["heightmap", "water", after];
  }

  /** Chooses unchanged flat land first; any local cut retains a one-layer terrain join. */
  run(context: GenerationContext): void {
    const { draft, params, rng, diagnostics } = context;
    draft.requiresDropships = true;
    const used = new Set<Direction>();
    for (const requirement of params.hooks.filter(
      (r) => r.kind === HookKinds.DEPLOY,
    )) {
      for (let i = 0; i < requirement.count; i++) {
        const edges = [
          ...rng.shuffle(DIRECTIONS.filter((d) => !used.has(d))),
          ...DIRECTIONS.filter((d) => used.has(d)),
        ];
        const positions = rng.shuffle(
          Array.from(
            { length: Math.max(draft.width, draft.depth) },
            (_, n) => n,
          ),
        );
        let plan: SitePlan | undefined;
        for (const search of DROPSHIP_SITE_RULES.searches) {
          plan = findSite(
            draft,
            edges,
            positions,
            search.edgeBand,
            search.maxCut,
          );
          if (plan) break;
        }
        if (!plan) {
          diagnostics.note(
            "no supported dropship site: aircraft/deploy placement cannot be satisfied",
          );
          continue;
        }
        for (const cut of plan.cuts) draft.setGroundLevel(cut.x, cut.z, cut.y);
        const zone = draft.addHook(
          "deployZones",
          HookKinds.DEPLOY,
          dropshipBoardingTiles(plan.clearance, plan.facing, plan.level),
          requirement.requiredPass,
          requirement.meta,
        );
        draft.dropships.push({
          deployZoneId: zone.id,
          clearance: plan.clearance,
          footprint: dropshipFootprint(plan.clearance, plan.facing),
          facing: plan.facing,
          level: plan.level,
        });
        used.add(plan.facing);
        diagnostics.note(
          `dropship on ${plan.facing}: ${plan.cuts.length} cut columns, ${plan.cost} layer-columns excavated, 16 external boarding columns`,
          zone.tiles[0],
        );
      }
    }
  }
}

/** Searches the mainland near the boundary, preferring zero earthworks across all edges. */
function findSite(
  draft: MapDraft,
  edges: readonly Direction[],
  positions: readonly number[],
  edgeBand: number,
  maxCut: number,
): SitePlan | undefined {
  const ground = buildGroundComponents(draft);
  const mainland = largestGroundComponent(ground);
  const connectorColumns = new Set(
    draft.connectors.flatMap((c) => [
      c.from.z * draft.width + c.from.x,
      c.to.z * draft.width + c.to.x,
    ]),
  );
  let best: SitePlan | undefined;
  const { width, length, margin, boardingSide } = DROPSHIP_SITE_RULES;
  const across = width + 2 * margin;
  const inward = 2 * margin + length + boardingSide;
  for (const facing of edges) {
    const vertical = facing === "n" || facing === "s";
    const axis = vertical ? draft.width : draft.depth;
    for (let offset = 0; offset <= edgeBand; offset++) {
      for (const along of positions) {
        if (along + across > axis) continue;
        const clearance: Rect = {
          x: vertical
            ? along
            : facing === "w"
              ? offset
              : draft.width - offset - inward,
          z: !vertical
            ? along
            : facing === "n"
              ? offset
              : draft.depth - offset - inward,
          w: vertical ? across : inward,
          d: vertical ? inward : across,
        };
        if (
          !draft.inBounds(clearance.x, clearance.z) ||
          !draft.inBounds(
            clearance.x + clearance.w - 1,
            clearance.z + clearance.d - 1,
          )
        )
          continue;
        const boarding = dropshipBoardingTiles(clearance, facing, 0);
        if (
          !boarding.some(
            (p) =>
              ground.nodes.has(p.z * draft.width + p.x) &&
              ground.components.find(p.z * draft.width + p.x) === mainland,
          )
        )
          continue;
        const plan = planSite(
          draft,
          clearance,
          facing,
          connectorColumns,
          maxCut,
        );
        if (plan && (!best || plan.cost < best.cost)) best = plan;
        if (best?.cost === 0) return best;
      }
    }
  }
  return best;
}

/** Validates dry unclaimed land and computes cuts without touching roads or other sites. */
function planSite(
  draft: MapDraft,
  clearance: Rect,
  facing: Direction,
  connectors: ReadonlySet<number>,
  maxCut: number,
): SitePlan | undefined {
  let level = Infinity;
  let high = -Infinity;
  const approach = dropshipApproachRect(clearance, facing);
  for (let z = clearance.z; z < clearance.z + clearance.d; z++) {
    for (let x = clearance.x; x < clearance.x + clearance.w; x++) {
      if (!canReserve(draft, x, z, connectors, rectContains(approach, x, z)))
        return undefined;
      const y = draft.groundLevelAt(x, z);
      level = Math.min(level, y);
      high = Math.max(high, y);
    }
  }
  if (high - level > maxCut) return undefined;
  if (high === level) return { clearance, facing, level, cuts: [], cost: 0 };
  const cuts: TileCoord[] = [];
  let cost = 0;
  // The halo is only excavated when needed for a one-layer join. Nothing is raised.
  const halo = draft.maxLevel();
  for (
    let z = Math.max(0, clearance.z - halo);
    z < Math.min(draft.depth, clearance.z + clearance.d + halo);
    z++
  ) {
    for (
      let x = Math.max(0, clearance.x - halo);
      x < Math.min(draft.width, clearance.x + clearance.w + halo);
      x++
    ) {
      const distance =
        Math.max(clearance.x - x, x - (clearance.x + clearance.w - 1), 0) +
        Math.max(clearance.z - z, z - (clearance.z + clearance.d - 1), 0);
      const before = draft.groundLevelAt(x, z);
      const y = Math.min(before, level + distance);
      if (y === before) continue;
      if (before - y > maxCut) return undefined;
      if (
        !canReserve(draft, x, z, connectors) ||
        draft.groundSurfaceAt(x, z) === SurfaceIds.SIDEWALK
      )
        return undefined;
      cuts.push({ x, y, z });
      cost += before - y;
    }
  }
  return { clearance, facing, level, cuts, cost };
}

/** Land that may support the aircraft without consuming existing roads or reservations. */
function canReserve(
  draft: MapDraft,
  x: number,
  z: number,
  connectors: ReadonlySet<number>,
  allowRoad = false,
): boolean {
  return (
    (allowRoad || !draft.isRoad(x, z)) &&
    !draft.isCovered(x, z) &&
    draft.groundSurfaceAt(x, z) !== SurfaceIds.WATER &&
    !draft.isLandingReserved(x, z) &&
    draft.propAt(draft.groundCoord(x, z)) === undefined &&
    Object.keys(draft.wallsAt(draft.groundCoord(x, z))).length === 0 &&
    !connectors.has(z * draft.width + x) &&
    !draft.lots.some((lot) => rectContains(lot.rect, x, z))
  );
}

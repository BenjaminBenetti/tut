import type { Rect } from "../../../core/model/grid";
import { rectContains } from "../../../core/service/grid-math";
import { CARAPACE_SITE_TUNING } from "../../data/carapace-site-tuning";
import { PropKindIds } from "../../data/props";
import { SurfaceIds } from "../../data/surfaces";
import type { GenerationContext } from "../../model/generation-pass";
import type {
  CarapaceSite,
  InfestationZone,
} from "../../model/infestation-plan";
import { PassMask } from "../../model/pass-mask";
import type { Rotation } from "../../model/prop";
import { infestationPressure } from "../../service/infestation-layout";
import { propPlacementTiles } from "../../service/prop-footprint";

// ===========================================
// Early platform planning
// ===========================================

/** Plans only compact dry platforms inside large growth patches, grading at most one layer. */
export function planCarapaceSites(
  context: GenerationContext,
  zones: readonly InfestationZone[],
): readonly InfestationZone[] {
  const { draft, params, rng, registries } = context;
  if (params.infestation < CARAPACE_SITE_TUNING.minimumLevel) return zones;
  const kinds: string[] = [
    PropKindIds.INFESTED_CARAPACE_LODGE,
    PropKindIds.INFESTED_CARAPACE_HALL,
  ];
  if (params.infestation >= CARAPACE_SITE_TUNING.keepMinimumLevel)
    kinds.push(PropKindIds.INFESTED_CARAPACE_KEEP);
  const offsets: { x: number; z: number }[] = [];
  const search = CARAPACE_SITE_TUNING.centreSearchRadius;
  for (let z = -search; z <= search; z++)
    for (let x = -search; x <= search; x++)
      if (Math.hypot(x, z) <= search) offsets.push({ x, z });
  offsets.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const planned: CarapaceSite[] = [];
  const limit = Math.ceil(zones.length * CARAPACE_SITE_TUNING.colonyShare);
  return zones.map((zone) => {
    if (planned.length >= limit) return zone;
    const roll = rng.fork(`carapace:${zone.id}`);
    for (const kind of roll.shuffle(kinds)) {
      const definition = registries.props.get(kind);
      const rotation = roll.nextInt(0, 3) as Rotation;
      const shape = definition.footprint!;
      const w = rotation % 2 === 0 ? shape.w : shape.d;
      const d = rotation % 2 === 0 ? shape.d : shape.w;
      for (const offset of offsets) {
        const footprint = {
          x: zone.centre.x + offset.x - Math.floor(w / 2),
          z: zone.centre.z + offset.z - Math.floor(d / 2),
          w,
          d,
        };
        const margin = CARAPACE_SITE_TUNING.clearance;
        const clearance = {
          x: footprint.x - margin,
          z: footprint.z - margin,
          w: w + margin * 2,
          d: d + margin * 2,
        };
        if (planned.some((site) => overlaps(site.clearance, clearance)))
          continue;
        const level = platformLevel(context, clearance);
        if (level === undefined) continue;
        const site = { kind, footprint, clearance, level, rotation };
        planned.push(site);
        for (let z = clearance.z; z < clearance.z + clearance.d; z++)
          for (let x = clearance.x; x < clearance.x + clearance.w; x++)
            draft.setGroundLevel(x, z, level);
        return { ...zone, carapace: site };
      }
    }
    return zone;
  });
}

/** Refuses roads, water, landing clearance and grading that would introduce a cliff. */
function platformLevel(
  context: GenerationContext,
  rect: Rect,
): number | undefined {
  const { draft, registries } = context;
  const levels: number[] = [];
  for (let z = rect.z; z < rect.z + rect.d; z++)
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (
        !draft.inBounds(x, z) ||
        x < 1 ||
        z < 1 ||
        x >= draft.width - 1 ||
        z >= draft.depth - 1 ||
        draft.isLandingReserved(x, z) ||
        draft.isRoad(x, z) ||
        draft.groundSurfaceAt(x, z) === SurfaceIds.SIDEWALK ||
        registries.surfaces.get(draft.groundSurfaceAt(x, z)).defaultPass !==
          PassMask.ALL ||
        infestationPressure(draft, x, z) < CARAPACE_SITE_TUNING.minimumPressure
      )
        return undefined;
      levels.push(draft.groundLevelAt(x, z));
    }
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  if (high - low > CARAPACE_SITE_TUNING.maximumGrading * 2) return undefined;
  const candidates = [...new Set(levels)].sort(
    (a, b) =>
      levels.reduce((sum, y) => sum + Math.abs(y - a), 0) -
      levels.reduce((sum, y) => sum + Math.abs(y - b), 0),
  );
  for (const level of candidates) {
    if (
      levels.some(
        (y) => Math.abs(y - level) > CARAPACE_SITE_TUNING.maximumGrading,
      )
    )
      continue;
    let safe = true;
    for (let z = rect.z - 1; z <= rect.z + rect.d; z++)
      for (let x = rect.x - 1; x <= rect.x + rect.w; x++)
        if (
          !rectContains(rect, x, z) &&
          Math.abs(draft.groundLevelAt(x, z) - level) >
            CARAPACE_SITE_TUNING.maximumGrading
        )
          safe = false;
    if (safe) return level;
  }
  return undefined;
}

/** Tests reservation overlap without claiming intervening growth corridors. */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d
  );
}

// ===========================================
// Final, mission-aware placement
// ===========================================

/** Places a solid building only when its footprint and complete circulation ring remain clear. */
export function placeCarapaceSite(
  context: GenerationContext,
  site: CarapaceSite,
  protectedColumns: ReadonlySet<number>,
): boolean {
  const { draft } = context;
  for (let z = site.clearance.z; z < site.clearance.z + site.clearance.d; z++)
    for (
      let x = site.clearance.x;
      x < site.clearance.x + site.clearance.w;
      x++
    ) {
      if (
        !draft.inBounds(x, z) ||
        draft.isLandingReserved(x, z) ||
        draft.isCovered(x, z) ||
        draft.propAt(draft.groundCoord(x, z)) ||
        Object.keys(draft.wallsAt(draft.groundCoord(x, z))).length > 0 ||
        draft.groundSurfaceAt(x, z) !== SurfaceIds.INFESTED ||
        Math.abs(draft.groundLevelAt(x, z) - site.level) > 1
      )
        return false;
    }
  // A protected firing route may split a large planned pad. A smaller shell
  // can use its clear side without grading or claiming any additional terrain.
  const kinds = [
    site.kind,
    PropKindIds.INFESTED_CARAPACE_HALL,
    PropKindIds.INFESTED_CARAPACE_LODGE,
  ];
  for (const kind of new Set(kinds)) {
    const definition = context.registries.props.get(kind);
    for (const rotation of [
      site.rotation,
      ((site.rotation + 1) % 4) as Rotation,
    ]) {
      const shape = definition.footprint!;
      const w = rotation % 2 === 0 ? shape.w : shape.d;
      const d = rotation % 2 === 0 ? shape.d : shape.w;
      for (
        let z = site.footprint.z;
        z <= site.footprint.z + site.footprint.d - d;
        z++
      )
        for (
          let x = site.footprint.x;
          x <= site.footprint.x + site.footprint.w - w;
          x++
        ) {
          const anchor = { x, y: site.level, z };
          const cells = propPlacementTiles(anchor, definition, rotation);
          if (
            cells.some(
              (tile) =>
                protectedColumns.has(tile.z * draft.width + tile.x) ||
                draft.groundLevelAt(tile.x, tile.z) !== site.level ||
                draft.slopeAt(tile.x, tile.z) !== undefined ||
                infestationPressure(draft, tile.x, tile.z) <
                  CARAPACE_SITE_TUNING.minimumPressure,
            )
          )
            continue;
          draft.addProp(kind, anchor, rotation, cells);
          return true;
        }
    }
  }
  return false;
}

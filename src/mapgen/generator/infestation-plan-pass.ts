import { INFESTATION_TUNING } from "../data/infestation-tuning";
import { SurfaceIds } from "../data/surfaces";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type {
  InfestationCorridor,
  InfestationZone,
} from "../model/infestation-plan";
import type { MapDraft } from "../model/map-draft";
import { PassMask } from "../model/pass-mask";
import type { ColumnCoord } from "../model/road";
import { ValueNoise } from "../service/value-noise";
import { planCarapaceSites } from "./infestation/carapace-sites";

/** Plans a connected colony ecology before streetside parcels claim the land. */
export class InfestationPlanPass implements GenerationPass {
  readonly id = "infestation-plan";
  readonly requires: readonly DraftCapability[] = [
    "heightmap",
    "landing-sites",
  ];
  readonly provides: readonly DraftCapability[] = ["infestation-plan"];

  /** Reserves expanding clearings and feeding lanes without rerolling the terrain or roads. */
  run(context: GenerationContext): void {
    const { draft, params, rng, diagnostics } = context;
    if (params.infestation === 0) return;
    const level = params.infestation;
    const target = Math.max(
      2,
      Math.round(
        (draft.width * draft.depth) / INFESTATION_TUNING.columnsPerColony,
      ),
    );
    const centres = selectCentres(context, target);
    const active = Math.max(
      1,
      Math.ceil(centres.length * (0.2 + level * 0.08)),
    );
    const zones: InfestationZone[] = centres
      .slice(0, active)
      .map((centre, index) => ({
        id: `colony-${index}`,
        centre,
        radius:
          INFESTATION_TUNING.baseRadius +
          level * INFESTATION_TUNING.radiusPerLevel,
        clearingRadius:
          INFESTATION_TUNING.baseClearingRadius +
          level * INFESTATION_TUNING.clearingRadiusPerLevel,
        maturity: level < 4 ? "outbreak" : level < 7 ? "nest" : "hive",
      }));
    const corridors = connectColonies(context, zones);
    const noise = new ValueNoise(rng.fork("growth-edge"));
    const influence: number[] = [];
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        if (!landAt(context, x, z) || draft.isLandingReserved(x, z)) {
          influence.push(0);
          continue;
        }
        const edge =
          (noise.fbm(
            x * INFESTATION_TUNING.noiseFrequency,
            z * INFESTATION_TUNING.noiseFrequency,
            3,
            0.5,
          ) -
            0.5) *
          0.22;
        let pressure = 0;
        for (const zone of zones) {
          const distance = Math.hypot(x - zone.centre.x, z - zone.centre.z);
          pressure = Math.max(
            pressure,
            1 -
              Math.max(0, distance - zone.clearingRadius * 0.5) / zone.radius +
              edge,
          );
        }
        if (level >= 3) {
          const width = INFESTATION_TUNING.corridorWidth + level * 0.16;
          for (const corridor of corridors) {
            for (let i = 1; i < corridor.points.length; i++) {
              const distance = distanceToSegment(
                { x, z },
                corridor.points[i - 1]!,
                corridor.points[i]!,
              );
              pressure = Math.max(
                pressure,
                (1 - distance / width) * (0.4 + level * 0.035) + edge,
              );
            }
          }
        }
        influence.push(
          Math.round(Math.max(0, Math.min(1, pressure)) * 100) / 100,
        );
      }
    }
    draft.infestation = { level, zones, corridors, influence, ruins: [] };
    const plannedZones = planCarapaceSites(context, zones);
    draft.infestation = { ...draft.infestation, zones: plannedZones };
    // A colony's excavated clearing interrupts the old terrain. One-layer
    // depressions remain freely traversable and are resolved by the slope pass.
    if (level >= 6)
      excavateClearings(
        draft,
        plannedZones.filter((zone) => zone.carapace === undefined),
      );
    diagnostics.note(
      `Infestation ecology: ${zones.length} reserved colonies, ${corridors.length} feeding corridors`,
    );
  }
}

// ===========================================
// District selection
// ===========================================

/** Picks separated land pockets near settlement roads, away from landing clearance. */
function selectCentres(
  context: GenerationContext,
  target: number,
): ColumnCoord[] {
  const { draft, rng } = context;
  const candidates: { position: ColumnCoord; rank: number }[] = [];
  for (let z = 5; z < draft.depth - 5; z += 2) {
    for (let x = 5; x < draft.width - 5; x += 2) {
      if (!clearLand(context, x, z, 2) || draft.isRoad(x, z)) continue;
      let roadDistance = 9;
      for (let dz = -8; dz <= 8; dz += 2)
        for (let dx = -8; dx <= 8; dx += 2)
          if (draft.inBounds(x + dx, z + dz) && draft.isRoad(x + dx, z + dz))
            roadDistance = Math.min(roadDistance, Math.hypot(dx, dz));
      candidates.push({
        position: { x, z },
        rank:
          rng.fork(`centre:${x}:${z}`).next() +
          Math.abs(roadDistance - 4) * 0.035,
      });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  const centres: ColumnCoord[] = [];
  for (const { position } of candidates) {
    if (
      centres.every(
        (other) =>
          Math.hypot(other.x - position.x, other.z - position.z) >=
          INFESTATION_TUNING.minimumColonySpacing,
      )
    )
      centres.push(position);
    if (centres.length >= target) break;
  }
  return centres;
}

/** A nest can grow only on passable dry land with room for its later core. */
function clearLand(
  context: GenerationContext,
  x: number,
  z: number,
  radius: number,
): boolean {
  const { draft } = context;
  for (let dz = -radius; dz <= radius; dz++)
    for (let dx = -radius; dx <= radius; dx++)
      if (
        !landAt(context, x + dx, z + dz) ||
        draft.isLandingReserved(x + dx, z + dz)
      )
        return false;
  return true;
}

/** Water, cliffs and map boundaries do not carry a colony influence field. */
function landAt(
  { draft, registries }: GenerationContext,
  x: number,
  z: number,
): boolean {
  return (
    draft.inBounds(x, z) &&
    registries.surfaces.get(draft.groundSurfaceAt(x, z)).defaultPass ===
      PassMask.ALL
  );
}

/** Each new colony joins its nearest older colony, creating a reproducible branching network. */
function connectColonies(
  { rng, draft }: GenerationContext,
  zones: readonly InfestationZone[],
): InfestationCorridor[] {
  return zones.slice(1).map((zone, offset) => {
    const previous = zones
      .slice(0, offset + 1)
      .sort(
        (a, b) =>
          Math.hypot(a.centre.x - zone.centre.x, a.centre.z - zone.centre.z) -
          Math.hypot(b.centre.x - zone.centre.x, b.centre.z - zone.centre.z),
      )[0]!;
    const roll = rng.fork(`corridor:${zone.id}`);
    const middle = {
      x: Math.max(
        2,
        Math.min(
          draft.width - 3,
          Math.round((previous.centre.x + zone.centre.x) / 2) +
            roll.nextInt(-3, 3),
        ),
      ),
      z: Math.max(
        2,
        Math.min(
          draft.depth - 3,
          Math.round((previous.centre.z + zone.centre.z) / 2) +
            roll.nextInt(-3, 3),
        ),
      ),
    };
    return {
      from: previous.id,
      to: zone.id,
      points: [previous.centre, middle, zone.centre],
    };
  });
}

/** Distance to a feeding lane, including its ends. */
function distanceToSegment(
  point: ColumnCoord,
  a: ColumnCoord,
  b: ColumnCoord,
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared,
          ),
        );
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

/** Excavates only an already level core, never creating an impassable drop. */
function excavateClearings(
  draft: MapDraft,
  zones: readonly InfestationZone[],
): void {
  for (const zone of zones) {
    const base = draft.groundLevelAt(zone.centre.x, zone.centre.z);
    const radius = Math.max(1, Math.floor(zone.clearingRadius - 1));
    const cells: ColumnCoord[] = [];
    let safe = base > 0;
    for (
      let z = zone.centre.z - radius - 1;
      z <= zone.centre.z + radius + 1;
      z++
    )
      for (
        let x = zone.centre.x - radius - 1;
        x <= zone.centre.x + radius + 1;
        x++
      ) {
        if (
          !draft.inBounds(x, z) ||
          draft.isLandingReserved(x, z) ||
          draft.groundLevelAt(x, z) !== base ||
          draft.groundSurfaceAt(x, z) === SurfaceIds.WATER
        )
          safe = false;
        if (Math.hypot(x - zone.centre.x, z - zone.centre.z) <= radius)
          cells.push({ x, z });
      }
    if (safe)
      for (const cell of cells) draft.setGroundLevel(cell.x, cell.z, base - 1);
  }
}

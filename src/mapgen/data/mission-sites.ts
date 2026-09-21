import type { DeployableTypeId } from "../../content/model/deployable-type-id";
import type {
  MissionSiteDefinition,
  SiteStructure,
} from "../model/mission-site";
import { HookKinds } from "../model/hook";
import { SurfaceIds } from "./surfaces";

// ===========================================
// Installation compounds
// ===========================================

/** Short, separated cover lines leave broad entrances on every side. */
function barriers(x: number, z: number, count: number): SiteStructure[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: "barrier",
    x: x + i,
    z,
  }));
}

/** Building-scale facilities, each with its own circulation and generator layout. */
export const MISSION_SITES: Readonly<
  Record<DeployableTypeId, MissionSiteDefinition>
> = {
  "sensor-array": {
    id: "sensor-array",
    width: 22,
    depth: 20,
    margin: 2,
    surface: SurfaceIds.PAVING,
    terrain: [
      { rect: { x: 1, z: 1, w: 20, d: 3 }, surface: SurfaceIds.DIRT },
      { rect: { x: 8, z: 13, w: 6, d: 7 }, surface: SurfaceIds.HARDSTAND },
    ],
    structures: [
      { kind: "installation-sensor", x: 6, z: 5 },
      ...barriers(2, 15, 3),
      ...barriers(17, 15, 3),
      ...barriers(2, 4, 2),
      ...barriers(18, 4, 2),
    ],
    objectives: [
      { kind: HookKinds.GENERATOR, x: 3, z: 10 },
      { kind: HookKinds.GENERATOR, x: 18, z: 9 },
    ],
  },
  "repellent-dispersal": {
    id: "repellent-dispersal",
    width: 24,
    depth: 22,
    margin: 2,
    surface: SurfaceIds.PAVING,
    terrain: [
      { rect: { x: 8, z: 0, w: 8, d: 22 }, surface: SurfaceIds.HARDSTAND },
      { rect: { x: 2, z: 3, w: 5, d: 8 }, surface: SurfaceIds.DIRT },
      { rect: { x: 17, z: 3, w: 5, d: 8 }, surface: SurfaceIds.DIRT },
    ],
    structures: [
      { kind: "installation-pump-house", x: 8, z: 9 },
      { kind: "installation-tanks", x: 3, z: 4 },
      { kind: "installation-tanks", x: 17, z: 4 },
      { kind: "installation-spray-tower", x: 3, z: 16 },
      { kind: "installation-spray-tower", x: 18, z: 16 },
      ...barriers(2, 1, 4),
      ...barriers(18, 1, 4),
    ],
    objectives: [
      { kind: HookKinds.GENERATOR, x: 4, z: 12 },
      { kind: HookKinds.GENERATOR, x: 19, z: 12 },
      { kind: HookKinds.GENERATOR, x: 11, z: 18 },
      { kind: HookKinds.GENERATOR, x: 12, z: 4 },
    ],
  },
  "defensive-battery": {
    id: "defensive-battery",
    width: 24,
    depth: 22,
    margin: 2,
    surface: SurfaceIds.DIRT,
    terrain: [
      { rect: { x: 5, z: 5, w: 14, d: 12 }, surface: SurfaceIds.PAVING },
      { rect: { x: 9, z: 17, w: 6, d: 5 }, surface: SurfaceIds.HARDSTAND },
    ],
    structures: [
      { kind: "installation-battery", x: 6, z: 6 },
      ...barriers(2, 4, 4),
      ...barriers(18, 4, 4),
      ...barriers(2, 17, 4),
      ...barriers(18, 17, 4),
      { kind: "crate", x: 7, z: 19 },
      { kind: "crate", x: 16, z: 19 },
    ],
    objectives: [
      { kind: HookKinds.GENERATOR, x: 3, z: 10 },
      { kind: HookKinds.GENERATOR, x: 20, z: 10 },
      { kind: HookKinds.GENERATOR, x: 12, z: 19 },
    ],
  },
  bank: {
    id: "bank",
    width: 22,
    depth: 22,
    margin: 2,
    surface: SurfaceIds.PAVING,
    terrain: [
      { rect: { x: 0, z: 16, w: 22, d: 4 }, surface: SurfaceIds.HARDSTAND },
      { rect: { x: 1, z: 1, w: 20, d: 3 }, surface: SurfaceIds.DIRT },
    ],
    structures: [
      { kind: "installation-bank", x: 5, z: 5 },
      ...barriers(2, 15, 3),
      ...barriers(17, 15, 3),
      { kind: "planter", x: 7, z: 20 },
      { kind: "planter", x: 14, z: 20 },
      { kind: "bench", x: 9, z: 20 },
      { kind: "bench", x: 12, z: 20 },
    ],
    objectives: [
      { kind: HookKinds.GENERATOR, x: 2, z: 9 },
      { kind: HookKinds.GENERATOR, x: 19, z: 9 },
      { kind: HookKinds.GENERATOR, x: 11, z: 18 },
    ],
  },
};

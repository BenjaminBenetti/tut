import type { Rect } from "../../core/model/grid";
import type { HookKind } from "./hook";
import type { PropKindId, Rotation } from "./prop";
import type { SurfaceId } from "./surface";
import type { TileCoord } from "./tile-coord";

// ===========================================
// Authored sites
// ===========================================

/** A terrain stamp in site-local columns; patches apply in declaration order. */
export interface SiteTerrainPatch {
  readonly rect: Rect;
  readonly surface: SurfaceId;
}

/** A solid structure or furnishing; its registered prop supplies collision and sight height. */
export interface SiteStructure {
  readonly kind: PropKindId;
  readonly x: number;
  readonly z: number;
  readonly rotation?: Rotation;
}

/** An objective socket, activated only when the recipe requests this hook kind. */
export interface SiteObjective {
  readonly kind: HookKind;
  readonly x: number;
  readonly z: number;
}

/**
 * Reusable, data-only composition of terrain, solid structures and objective
 * sockets. Coordinates are local to a graded rectangular yard. The planner
 * reserves it before settlement parcels; later passes cannot scatter into it.
 * A future mission registers a new definition and requests its id in `site`.
 * Models remain a graphics concern; occupied footprints remain simulation data.
 */
export interface MissionSiteDefinition {
  readonly id: string;
  readonly width: number;
  readonly depth: number;
  /** Clear shoulder around the yard, kept free for circulation and terrain joins. */
  readonly margin: number;
  readonly surface: SurfaceId;
  readonly terrain: readonly SiteTerrainPatch[];
  readonly structures: readonly SiteStructure[];
  readonly objectives: readonly SiteObjective[];
}

/** Draft-only placement; frozen maps contain its ordinary terrain, props and hooks. */
export interface MissionSitePlacement {
  readonly id: string;
  readonly bounds: Rect;
  readonly clearance: Rect;
  readonly objectives: readonly {
    readonly kind: HookKind;
    readonly tile: TileCoord;
  }[];
  /** Structural pieces must survive connectivity repair, like building shells. */
  readonly structureIds: readonly string[];
}

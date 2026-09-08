import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";

/** A landed aircraft, with its unit-start tiles owned by the referenced hook. */
export interface DropshipSite {
  readonly deployZoneId: string;
  /** Complete aircraft envelope, including the lowered ramp. */
  readonly footprint: Rect;
  /** Clear circulation and approach margin; its outside edge may slope into the terrain. */
  readonly clearance: Rect;
  readonly level: number;
  /** Nose toward this map edge; boarding is on the opposite side. */
  readonly facing: Direction;
}

/** Generation dimensions agreed against the complete Art envelope (#911). */
export interface DropshipSiteRules {
  readonly width: number;
  readonly length: number;
  readonly margin: number;
  readonly boardingSide: number;
  /** Ordered fallbacks; a later search cannot move an already-supported placement. */
  readonly searches: readonly {
    readonly edgeBand: number;
    readonly maxCut: number;
  }[];
}

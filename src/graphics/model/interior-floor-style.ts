/** Finishes assigned to whole rooms, so the floor reinforces the room's purpose. */
export type InteriorFloorFinish =
  "timber" | "carpet" | "ceramic" | "concrete" | "marble" | "steel";

/** A room's stable finish and subdued colour variation. */
export interface InteriorFloorAppearance {
  readonly finish: InteriorFloorFinish;
  readonly variant: 0 | 1;
}

/** Environment colours and repeat size for a floor material. */
export interface InteriorFloorStyle {
  readonly colours: readonly [number, number];
  readonly seam: number;
  readonly roughness: number;
}

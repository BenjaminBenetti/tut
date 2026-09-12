import type { NATURAL_MATERIAL_SURFACES } from "../data/natural-material-transition";

/** Ground albedo targets; absent surfaces retain their authored atlas colours. */
export type BiomeGroundStyle = Readonly<
  Partial<Record<(typeof NATURAL_MATERIAL_SURFACES)[number], number>>
>;

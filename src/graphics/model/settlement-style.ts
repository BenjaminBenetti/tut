import type { RegionId } from "../../overworld/model/region";

// ===========================================
// Settlement style
// ===========================================

/**
 * The regional architectural family a settlement marker is drawn in
 * (#1155). Each family has its own rural, town and city model
 * (`overworld.settlement.<style>.<scale>`) built by
 * `tools/art/models/settlement_styles.py` from the concept sheet
 * `docs/design/concepts/overworld-settlement-<style>.md`.
 */
export type SettlementStyleId =
  | "north-american"
  | "european"
  | "slavic"
  | "middle-eastern"
  | "african"
  | "south-asian"
  | "east-asian"
  | "southeast-asian"
  | "latin-american"
  | "oceanian";

/** Every settlement style, in the order the model kit builds them. */
export const SETTLEMENT_STYLE_IDS: readonly SettlementStyleId[] = [
  "north-american",
  "european",
  "slavic",
  "middle-eastern",
  "african",
  "south-asian",
  "east-asian",
  "southeast-asian",
  "latin-american",
  "oceanian",
];

/** Which style each region's settlements wear, and the style for a region the table does not know. */
export interface SettlementStyleCatalogue {
  readonly byRegion: Readonly<Record<RegionId, SettlementStyleId>>;
  readonly fallback: SettlementStyleId;
}

/** Resolves the style a region's settlements are drawn in; views depend on this, not on the table. */
export interface SettlementStyleSource {
  /** The style for `regionId`, never undefined: an unknown region gets the catalogue's fallback. */
  styleFor(regionId: RegionId): SettlementStyleId;
}

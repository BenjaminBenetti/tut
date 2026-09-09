import type { KnownBuildingKindId } from "./building-kind-ids";
import { PropKindIds } from "./props";
import type { YardArrangement } from "../model/yard-arrangement";

/** Uses follow actual building kinds; no business is invented for visual variety. */
export const YARD_ARRANGEMENTS: Readonly<
  Record<KnownBuildingKindId, YardArrangement>
> = {
  house: { prop: PropKindIds.BENCH, count: 1, spacing: 1, frontage: true },
  apartment: { prop: PropKindIds.BENCH, count: 2, spacing: 2, frontage: true },
  tower: { prop: PropKindIds.BENCH, count: 2, spacing: 2, frontage: true },
  shop: { prop: PropKindIds.CRATE, count: 2, spacing: 1, frontage: false },
  warehouse: { prop: PropKindIds.CRATE, count: 3, spacing: 1, frontage: false },
};

import type { KnownBuildingKindId } from "./building-kind-ids";
import { PropKindIds } from "./props";
import type { YardArrangement } from "../model/yard-arrangement";

/** The yard the four installations share (#1175). */
const INSTALLATION_YARD: readonly YardArrangement[] = [
  {
    props: [PropKindIds.SANDBAGS, PropKindIds.CRATE],
    spacing: 2,
    frontage: false,
  },
  {
    props: [PropKindIds.CRATE, PropKindIds.CRATE],
    spacing: 1,
    frontage: false,
  },
];

/** Uses follow actual building kinds; no business is invented for visual variety. */
export const YARD_ARRANGEMENTS: Readonly<
  Record<KnownBuildingKindId, readonly YardArrangement[]>
> = {
  house: [
    { props: [PropKindIds.BENCH], spacing: 1, frontage: true },
    {
      props: [PropKindIds.BENCH, PropKindIds.TABLE],
      spacing: 2,
      frontage: false,
    },
  ],
  apartment: [
    {
      props: [PropKindIds.BENCH, PropKindIds.BENCH],
      spacing: 2,
      frontage: true,
    },
    {
      props: [PropKindIds.BENCH, PropKindIds.TABLE, PropKindIds.BENCH],
      spacing: 2,
      frontage: true,
    },
  ],
  tower: [
    {
      props: [PropKindIds.BENCH, PropKindIds.BENCH],
      spacing: 2,
      frontage: true,
    },
    { props: [PropKindIds.BENCH], spacing: 1, frontage: true },
  ],
  shop: [
    {
      props: [PropKindIds.CRATE, PropKindIds.CRATE],
      spacing: 1,
      frontage: false,
    },
    {
      props: [PropKindIds.TABLE, PropKindIds.BENCH],
      spacing: 2,
      frontage: true,
    },
  ],
  warehouse: [
    {
      props: [PropKindIds.CRATE, PropKindIds.CRATE, PropKindIds.CRATE],
      spacing: 1,
      frontage: false,
    },
    {
      props: [PropKindIds.CRATE, PropKindIds.CRATE],
      spacing: 2,
      frontage: false,
    },
  ],
  // Installations (#1175): sandbags and crates, a site expecting trouble.
  "sensor-array": INSTALLATION_YARD,
  "repellent-dispersal": INSTALLATION_YARD,
  "defensive-battery": INSTALLATION_YARD,
  bank: INSTALLATION_YARD,
};

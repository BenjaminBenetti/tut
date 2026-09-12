import type { StreetPropTuning } from "../model/street-prop-tuning";
import { PropKindIds } from "./props";

/** Streets read as abandoned neighbourhoods with occasional improvised defenses. */
export const STREET_PROP_TUNING: StreetPropTuning = {
  weights: {
    [PropKindIds.CAR]: 5,
    [PropKindIds.DUMPSTER]: 1,
    [PropKindIds.BARRIER]: 0.7,
    [PropKindIds.SANDBAGS]: 0.3,
  },
  defaultWeight: 1,
};

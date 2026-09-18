import type { PropModelVariant } from "../model/prop-model-variant";

/**
 * Variants preserve each prop kind's footprint and readable cover height.
 * Full-size cars occupy two cells; newer cars face +Z where the sedan runs along X.
 */
export const PROP_MODEL_VARIANTS: Readonly<
  Record<string, readonly PropModelVariant[]>
> = {
  "infested-hive": [
    { modelId: "prop.infested-hive-spire", turns: 0 },
    { modelId: "prop.infested-hive-crown", turns: 0 },
  ],
  "infested-brood": [{ modelId: "prop.infested-nest-large", turns: 0 }],
  "infested-ribs": [
    { modelId: "prop.infested-burrow-ribs", turns: 0 },
    { modelId: "prop.infested-nest-split", turns: 0 },
  ],
  "infested-vent": [
    { modelId: "prop.infested-vent-tall", turns: 0 },
    { modelId: "prop.infested-feeder", turns: 0 },
  ],
  "infested-spines": [
    { modelId: "prop.infested-spine-tall", turns: 0 },
    { modelId: "prop.infested-spine-cluster", turns: 0 },
  ],
  "infested-eggs": [{ modelId: "prop.infested-egg-clutch", turns: 0 }],
  "infested-rubble": [
    { modelId: "prop.rubble-brick", turns: 0 },
    { modelId: "prop.rubble-concrete", turns: 0 },
    { modelId: "prop.rubble-timber", turns: 0 },
    { modelId: "prop.infested-shell-barricade", turns: 0 },
  ],
  "infested-ruin": [
    { modelId: "prop.ruin-corner", turns: 0 },
    { modelId: "prop.ruin-column", turns: 0 },
    { modelId: "prop.ruin-frame", turns: 0 },
  ],
  "infested-debris": [
    { modelId: "prop.roof-fragment", turns: 0 },
    { modelId: "prop.infested-spine-low", turns: 0 },
    { modelId: "prop.infested-vent-low", turns: 0 },
    { modelId: "prop.infested-egg-bed", turns: 0 },
    { modelId: "prop.infested-tendril-node", turns: 0 },
    { modelId: "prop.infested-carapace", turns: 0 },
    { modelId: "prop.infested-shell-ridge", turns: 0 },
    { modelId: "prop.infested-shell-fan", turns: 0 },
    { modelId: "prop.infested-pipe", turns: 0 },
  ],
  "infested-arch": [{ modelId: "prop.infested-arch", turns: 0 }],
  car: [
    { modelId: "prop.car-sedan", turns: 0 },
    { modelId: "prop.car-hatchback", turns: 1 },
    { modelId: "prop.car-utility", turns: 1 },
  ],
};

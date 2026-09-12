import type { PropModelVariant } from "../model/prop-model-variant";

/** Full-size cars occupy two cells; the new models face +Z where the sedan runs along X. */
export const PROP_MODEL_VARIANTS: Readonly<
  Record<string, readonly PropModelVariant[]>
> = {
  car: [
    { modelId: "prop.car-sedan", turns: 0 },
    { modelId: "prop.car-hatchback", turns: 1 },
    { modelId: "prop.car-utility", turns: 1 },
  ],
};

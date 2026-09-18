import type { InfestationAppearance } from "../model/infestation-appearance";

/** Broad resin runs surround textured nest floors; shallow growth never suggests cover. */
export const INFESTATION_APPEARANCE: InfestationAppearance = {
  dominantGround: "tile.ground.infested",
  groundReliefShare: 0.16,
  nestReliefShare: 0.32,
  ground: [
    "tile.ground.infested-ribbed",
    "tile.ground.infested-cracked",
    "tile.ground.infested-veined",
  ],
  nestGround: [
    "tile.ground.infested-rooted",
    "tile.ground.infested-nest-floor",
  ],
  groundDetail: [
    "prop.infested-roots",
    "prop.infested-edge-growth",
    "prop.infested-husk",
  ],
  edgeDetail: ["prop.infested-edge-growth", "prop.infested-roots"],
  detailShare: 0.075,
  edgeShare: 0.25,
  detailMinScale: 0.65,
  poolShare: 0.008,
};

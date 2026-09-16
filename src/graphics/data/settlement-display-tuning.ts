import type { SettlementDisplayTuning } from "../model/settlement-display-look";

/**
 * The settlement display look (#1155), after the concept sheet
 * `docs/design/concepts/overworld-settlement-wargames.png`: bodies a
 * little above `ui-bg` so the lit tops separate from the slab, edges
 * and windows in `ui-info` cyan, the beacon `tdf-orange`. Edges start
 * faint at the world zoom (40 px per unit, a city about 24 px wide)
 * and come up to strength by the regional zoom.
 */
export const SETTLEMENT_DISPLAY_TUNING: SettlementDisplayTuning = {
  bodyColour: 0x1b2230,
  foliageColour: 0x111722,
  windowColour: 0x9fd8f0,
  beaconColour: 0xf08a24,
  accentColour: 0x7fd1ff,
  edgeColour: 0x7fd1ff,
  edgeThresholdDeg: 30,
  edgeOpacityFar: 0.14,
  edgeOpacityNear: 0.55,
  edgeFadeFarZoom: 48,
  edgeFadeNearZoom: 150,
};

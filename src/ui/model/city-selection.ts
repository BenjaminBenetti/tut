// ===========================================
// City selection (former name)
// ===========================================
//
// #293 introduced `CitySelection` for the picked city; #76 widened it to
// the mission as `OverworldSelection`. The old name is kept for one
// release so existing imports compile; new code imports
// `OverworldSelection` from `./overworld-selection`.

export type { OverworldSelection as CitySelection } from "./overworld-selection";

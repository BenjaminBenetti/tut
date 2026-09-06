import type { RoadStyle } from "../../mapgen/model/settlement-definition";
import type { RoadStyleDefinition } from "../model/road-style-definition";

/** Dirt trails stay unpainted; streets and avenues share asphalt and pale concrete. */
export const ROAD_STYLES: Readonly<Record<RoadStyle, RoadStyleDefinition>> = {
  trail: { surface: "dirt", kerbs: false, markings: false },
  streets: { surface: "road", kerbs: true, markings: true },
  grid: { surface: "road", kerbs: true, markings: true },
};

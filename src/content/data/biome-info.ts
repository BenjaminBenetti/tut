import type { BiomeId } from "../model/biome-id";
import type { BiomeInfo } from "../model/biome-info";

/** Battlefield character of every shipped environment. */
export const BIOME_INFO: Readonly<Record<BiomeId, BiomeInfo>> = {
  temperate: {
    name: "Temperate",
    description:
      "Green hills, mixed woodland and stone tracks between settlements.",
  },
  snowy: {
    name: "Snowy",
    description:
      "Snowfields, exposed rock and conifers across cold, broken ground.",
  },
  desert: {
    name: "Desert",
    description:
      "Sandy ridges and scattered boulders leave long approaches exposed.",
  },
  coastal: {
    name: "Coastal",
    description:
      "Sandy shores constrain the battlefield beside low coastal settlements.",
  },
  tropical: {
    name: "Tropical rainforest",
    description:
      "Red earth and dense clusters of broadleaf trees and palms break up the approaches.",
  },
  savanna: {
    name: "Savanna",
    description:
      "Golden grassland, dry earth and scattered trees frame rocky islands of cover.",
  },
  steppe: {
    name: "Steppe",
    description:
      "Wide grasslands with gentle rises, sparse cover and long sightlines.",
  },
  mediterranean: {
    name: "Mediterranean scrub",
    description:
      "Dry olive-coloured hills, pale rock and scattered pine groves.",
  },
  taiga: {
    name: "Taiga",
    description:
      "Dense conifer stands on cool forest ground create wooded approaches.",
  },
  tundra: {
    name: "Tundra",
    description:
      "Treeless, frost-streaked ground with low rises and boulder fields.",
  },
  alpine: {
    name: "Alpine",
    description:
      "Rocky highlands, snow patches and sparse pines reward control of the heights.",
  },
  wetland: {
    name: "Wetlands",
    description:
      "Low, muddy banks and tropical groves flank an impassable waterway.",
  },
};

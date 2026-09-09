import type { DropshipSiteRules } from "../model/dropship-site";

/** Full aircraft, one-column circulation/approach margin and sixteen external starts. */
export const DROPSHIP_SITE_RULES: DropshipSiteRules = {
  width: 5,
  length: 7,
  margin: 1,
  boardingSide: 4,
  searches: [
    { edgeBand: 4, maxCut: 1 },
    { edgeBand: 8, maxCut: 1 },
    { edgeBand: 12, maxCut: 1 },
    { edgeBand: 12, maxCut: 2 },
  ],
};

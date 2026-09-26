import type { ActId } from "../../content/model/act-id";
import type { ActDefinition } from "../model/act-definition";

// ===========================================
// Acts
// ===========================================

/**
 * The four acts of the campaign (campaign arc §3, §5 and §11). Keyed by
 * the closed `ActId` union, so a new act without a definition fails to
 * compile.
 *
 * ```
 *   act     board  band    clearance  crash site  evacuation  sitreps
 *   act-1   3      d1–4    33         33          33          1 × 40%
 *   act-2   4      d3–7    25         10          10          1 × 40%
 *   act-3   5      d5–9    20         10          10          2 × 40%
 *   finale  5      d8–10   –          –           –           2 × 40%
 * ```
 *
 * `typeWeights` holds only the types that have shipped. The arc's other
 * director-drawn types (Tunnel Sabotage, Alpha Hunt) add their weights
 * here when they land; the draw renormalises, so the weights are the
 * arc's percentages as written. Crash Site's and Evacuation's weights
 * apply only once the type has debuted (each offer rule's `debut`: the
 * third mission of Act I, after two have resolved) and, for Evacuation,
 * only while some detected city is at infestation 25 or more; the
 * director skips a type with no eligible site. Defend Installation is
 * trigger-driven (arc §5) and has no weight. Hive Assault has none
 * either: its trigger pins an offer for every hive that stands
 * (`hive-assault-trigger.ts`), so no hive is ever left over for the
 * board, and the arc's "20% for non-pinned hives" row has nothing to
 * draw. The finale draws no director offers: its missions are pinned
 * story ones.
 */
export const ACTS: Readonly<Record<ActId, ActDefinition>> = {
  "act-1": {
    id: "act-1",
    name: "Emergence",
    boardCap: 3,
    difficultyBand: { min: 1, max: 4 },
    typeWeights: {
      "infestation-clearance": 33,
      "crash-site": 33,
      evacuation: 33,
    },
    sitrepSlots: 1,
    sitrepChance: 0.4,
  },
  "act-2": {
    id: "act-2",
    name: "Incubation",
    boardCap: 4,
    difficultyBand: { min: 3, max: 7 },
    typeWeights: {
      "infestation-clearance": 25,
      "crash-site": 10,
      evacuation: 10,
    },
    sitrepSlots: 1,
    sitrepChance: 0.4,
  },
  "act-3": {
    id: "act-3",
    name: "Reclamation",
    boardCap: 5,
    difficultyBand: { min: 5, max: 9 },
    typeWeights: {
      "infestation-clearance": 20,
      "crash-site": 10,
      evacuation: 10,
    },
    sitrepSlots: 2,
    sitrepChance: 0.4,
  },
  finale: {
    id: "finale",
    name: "The Platform",
    boardCap: 5,
    difficultyBand: { min: 8, max: 10 },
    typeWeights: {},
    sitrepSlots: 2,
    sitrepChance: 0.4,
  },
};

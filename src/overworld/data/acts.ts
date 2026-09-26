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
 *   act     board  band    clearance  sitreps
 *   act-1   3      d1–4    33         1 × 40%
 *   act-2   4      d3–7    25         1 × 40%
 *   act-3   5      d5–9    20         2 × 40%
 *   finale  5      d8–10   –          2 × 40%
 * ```
 *
 * `typeWeights` holds only the types that have shipped. The arc's other
 * director-drawn types (Crash Site, Evacuation, Hive Assault, Tunnel
 * Sabotage, Alpha Hunt) add their weights here when they land; the draw
 * renormalises, so the weights are the arc's percentages as written.
 * Defend Installation is trigger-driven (arc §5) and has no weight. The
 * finale draws no director offers: its missions are pinned story ones.
 */
export const ACTS: Readonly<Record<ActId, ActDefinition>> = {
  "act-1": {
    id: "act-1",
    name: "Emergence",
    boardCap: 3,
    difficultyBand: { min: 1, max: 4 },
    typeWeights: { "infestation-clearance": 33 },
    sitrepSlots: 1,
    sitrepChance: 0.4,
  },
  "act-2": {
    id: "act-2",
    name: "Incubation",
    boardCap: 4,
    difficultyBand: { min: 3, max: 7 },
    typeWeights: { "infestation-clearance": 25 },
    sitrepSlots: 1,
    sitrepChance: 0.4,
  },
  "act-3": {
    id: "act-3",
    name: "Reclamation",
    boardCap: 5,
    difficultyBand: { min: 5, max: 9 },
    typeWeights: { "infestation-clearance": 20 },
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

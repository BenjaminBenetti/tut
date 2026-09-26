// ===========================================
// Act id
// ===========================================

/**
 * The acts of the campaign (campaign arc §3, ADR 0013 §2.1). Shared
 * vocabulary: the overworld keeps the current act in its campaign
 * progress and freezes it on every offer, and the bestiary, the sitrep
 * rules and the UI read it. A closed union so every table keyed by it
 * (`ACTS` in `overworld/data/acts`, the bestiary by act) must name each
 * act, and a missing entry fails to compile.
 *
 * ```
 *   act-1 Emergence ──► act-2 Incubation ──► act-3 Reclamation ──► finale
 * ```
 */
export type ActId = "act-1" | "act-2" | "act-3" | "finale";

/**
 * Every act id, in campaign order. The order is the order acts are
 * played in, so "the next act" is the next entry.
 */
export const ACT_IDS: readonly ActId[] = ["act-1", "act-2", "act-3", "finale"];

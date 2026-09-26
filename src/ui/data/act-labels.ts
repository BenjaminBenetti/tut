import type { ActId } from "../../content/model/act-id";
import { ACTS } from "../../overworld/data/acts";

// ===========================================
// Act labels
// ===========================================

/**
 * What each act is called on screen (campaign arc §3): its place in the
 * campaign, then the act's own name from `ACTS`, so a renamed act
 * renames its label. Keyed by the closed `ActId` union, so a new act
 * without a label fails to compile.
 *
 * ```
 *   Act I · Emergence   Act II · Incubation   Act III · Reclamation   Finale · The Platform
 * ```
 */
export const ACT_LABELS: Readonly<Record<ActId, string>> = {
  "act-1": `Act I · ${ACTS["act-1"].name}`,
  "act-2": `Act II · ${ACTS["act-2"].name}`,
  "act-3": `Act III · ${ACTS["act-3"].name}`,
  finale: `Finale · ${ACTS.finale.name}`,
};

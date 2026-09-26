// ===========================================
// Conditions
// ===========================================

/**
 * What the campaign has achieved, as far as the tech tree needs to know
 * (ADR 0013 §2.7): the flags that reveal hidden nodes. `tech/` never
 * reads the overworld itself; whoever asks the tree a question (the
 * unlock handler, the tech tree screen) derives this from the campaign
 * and passes it in, so the tree stays below the overworld in the
 * layering.
 *
 * ```
 *   campaign ──conditionsOf(state)──► TechConditions { flags } ──► unlockTech
 *                                                               └─► techNodeStatus
 * ```
 */
export interface TechConditions {
  /** Every campaign flag currently set. */
  readonly flags: ReadonlySet<string>;
}

/** No flags at all: a fresh campaign, or a caller with no campaign. Every node with `requiresFlags` is hidden. */
export const NO_TECH_CONDITIONS: TechConditions = { flags: new Set<string>() };

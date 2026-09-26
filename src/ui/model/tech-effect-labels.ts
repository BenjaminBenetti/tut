// ===========================================
// Tech effect labels
// ===========================================

/**
 * Readable names for the tech effects whose ids name nothing a catalogue
 * can look up (ADR 0013 §2.7): campaign flags and infantry upgrades.
 * Each value reads after the detail panel's "Unlocks" heading, so it is
 * a noun phrase: `"capture-net"` → `"The capture net"`. An id with no
 * entry is shown as its words ("Capture net"), so a missing label is
 * plain rather than broken.
 */
export interface TechEffectLabels {
  /** Names for flag effects, keyed by flag id. */
  readonly flags: Readonly<Partial<Record<string, string>>>;
  /** Names for infantry upgrade effects, keyed by upgrade id. */
  readonly infantryUpgrades: Readonly<Partial<Record<string, string>>>;
}

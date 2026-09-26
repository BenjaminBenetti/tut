// ===========================================
// Smart enemies preference
// ===========================================

/**
 * The player's "Smart enemies (Jev)" setting (campaign arc §9): whether
 * named enemies may be put under Jev control. It is on by default and
 * lives beside the saves in browser storage, never in a save, so it
 * follows the player rather than the campaign.
 *
 * It only gates **new** actors. Turning it off leaves any enemy already
 * under Jev in the running mission as it is until that mission ends;
 * turning it on configures the named enemies not yet configured.
 */
export interface JevPreference {
  /** Whether named enemies may be put under Jev; `true` until the player says otherwise. */
  enabled(): boolean;
  /** Records the player's choice for this and every later session. */
  setEnabled(enabled: boolean): void;
}

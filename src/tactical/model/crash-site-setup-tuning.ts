// ===========================================
// Crash Site setup tuning
// ===========================================

/**
 * What a crash site's setup reads beyond the shared spawn tuning
 * (campaign arc §6.3, #1179): a pod on a harder landing ripens sooner.
 * The shared pod fields (`SpawnTuning.podMaturityTurn`, `podHp`) are the
 * Intact Pod's too, so the crash site's own clock lives here. Defaults
 * live in `tactical/data/crash-site-setup-tuning.ts`; the composition
 * root passes them through `MissionSetupDeps.crashSite`.
 *
 * ```
 *   difficulty < earlyMaturityFromDifficulty  ──► deadline podMaturityTurn   (8)
 *   difficulty ≥ earlyMaturityFromDifficulty  ──► deadline earlyMaturityTurn (5)
 * ```
 */
export interface CrashSiteSetupTuning {
  /** The difficulty from which the pod ripens early. Positive integer. */
  readonly earlyMaturityFromDifficulty: number;
  /**
   * The turn whose end ripens the pod from that difficulty on: the
   * destroy-pod objective's `deadlineTurn`. Positive integer, at most
   * `SpawnTuning.podMaturityTurn`.
   */
  readonly earlyMaturityTurn: number;
}

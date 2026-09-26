// ===========================================
// Jev policy
// ===========================================

/**
 * An app-side rule that decides which units Jev drives, run by the
 * tactical screen for as long as it is mounted (ADR 0013 §2.8). The
 * shipped one is `app/controller/jev-default-policy`, which puts named
 * enemies under Jev. The screen only starts and stops it: what the rule
 * configures, and when, is the app's business.
 *
 * ```
 *   TacticalScreen.mount ──► store.subscribe(render) ──► jev.start() ──► policy.start()
 *   TacticalScreen.unmount ─► policy.dispose() ──► jev.dispose()
 * ```
 */
export interface JevPolicy {
  /** Applies the rule to the active mission now and after every later store change. */
  start(): void;
  /** Stops observing the store; nothing it configured is undone. */
  dispose(): void;
}

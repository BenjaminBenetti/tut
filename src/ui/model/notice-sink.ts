// ===========================================
// Notices
// ===========================================

/** How urgent a notice is; maps onto the style guide's status colours. */
export type NoticeTone = "info" | "warn" | "danger";

/** A player-facing message that must outlive whatever screen is up. */
export interface Notice {
  readonly message: string;
  readonly tone: NoticeTone;
}

/**
 * Where app-level services put messages the player has to see: an
 * autosave that failed, for instance. Screens come and go with the
 * router, so a sink lives outside them and the app decides how it is
 * shown (the bootstrap mounts a `NoticeBarView`).
 */
export interface NoticeSink {
  /** Shows `notice`, replacing any notice already showing. */
  notify(notice: Notice): void;
}

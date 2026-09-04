import type { TacticalPhase } from "../../tactical/model/tactical-state";
import { formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** One phase change to announce, taken from a `TurnStarted` payload. */
export interface PhaseAnnouncement {
  readonly phase: TacticalPhase;
  readonly turn: number;
}

/** Timers and durations, injected so tests need no wall clock. */
export interface PhaseBannerOptions {
  /** How long a banner holds before it dismisses itself. */
  readonly holdMs?: number;
  /** Defaults to `setTimeout`. */
  readonly setTimer?: (run: () => void, ms: number) => number;
  /** Defaults to `clearTimeout`. */
  readonly clearTimer?: (handle: number) => void;
}

// ===========================================
// Constants
// ===========================================

/**
 * How long each banner holds. Long enough to read two words at a glance
 * and to survive a bug phase that resolves instantly, short enough that
 * a player ending turns quickly is never waiting on it.
 */
export const PHASE_BANNER_HOLD_MS = 1100;

/** What each phase's banner says. */
const TITLES: Readonly<Record<TacticalPhase, string>> = {
  player: "Your turn",
  bugs: "Bug phase",
};

// ===========================================
// PhaseBannerView
// ===========================================

/**
 * The unmissable half of the turn readout (#523): a banner across the
 * middle of the viewport when a phase begins, animated in, dismissing
 * itself, and skippable with a click. The persistent readout in
 * `TurnBannerView` is the status; this is the transition.
 *
 * ```
 *   announce([bugs t1, player t2])   one EndTurn emits both
 *          │
 *   queue ─┴─► ┌──────────────────┐ hold ──► ┌──────────────────┐ hold ──► idle
 *              │    BUG PHASE     │          │    YOUR TURN     │
 *              │     Turn 1       │          │ The bugs have    │
 *              └──────────────────┘          │ finished · Turn 2│
 *                      click skips ──────────┘
 * ```
 *
 * The bug phase can resolve in well under a second, so banners **queue**
 * rather than replace each other: an instant bug phase is still read
 * before "Your turn" follows it, and a slow one cannot stack two
 * announcements on top of one another. A player banner that follows the
 * bugs says so outright, which is the part the Executive Director could
 * not tell from the status line alone.
 *
 * The element only takes pointer events while a banner is up, so it
 * never swallows a click on the map for longer than it is visible.
 */
export class PhaseBannerView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly holdMs: number;
  private readonly setTimer: (run: () => void, ms: number) => number;
  private readonly clearTimer: (handle: number) => void;
  private root: HTMLElement | undefined;
  private titleEl: HTMLElement | undefined;
  private detailEl: HTMLElement | undefined;
  private readonly queue: PhaseAnnouncement[] = [];
  private showing: PhaseAnnouncement | undefined;
  /** The phase of the banner shown before this one, so "after the bugs" can be said. */
  private previous: TacticalPhase | undefined;
  private timer: number | undefined;
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param options - Hold time and timers; the defaults are the DOM's. */
  constructor(options: PhaseBannerOptions = {}) {
    this.holdMs = options.holdMs ?? PHASE_BANNER_HOLD_MS;
    this.setTimer =
      options.setTimer ??
      ((run, ms) => globalThis.setTimeout(run, ms) as unknown as number);
    this.clearTimer =
      options.clearTimer ??
      ((handle) => {
        globalThis.clearTimeout(handle);
      });
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the banner under `parent`, idle and invisible. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement("div");
    root.id = "phase-banner";
    root.className = "tut-phase-banner";
    root.dataset.role = "phase-banner";
    root.hidden = true;
    const title = doc.createElement("strong");
    title.className = "tut-phase-banner__title";
    title.dataset.field = "title";
    const detail = doc.createElement("span");
    detail.className = "tut-phase-banner__detail";
    detail.dataset.field = "detail";
    root.append(title, detail);
    parent.appendChild(root);
    const onClick = (): void => {
      this.skip();
    };
    root.addEventListener("click", onClick);
    this.dispose = () => {
      root.removeEventListener("click", onClick);
    };
    this.root = root;
    this.titleEl = title;
    this.detailEl = detail;
  }

  /** Clears any pending banner and removes the element. */
  unmount(): void {
    this.cancelTimer();
    this.queue.length = 0;
    this.showing = undefined;
    this.previous = undefined;
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.titleEl = undefined;
    this.detailEl = undefined;
  }

  // ===========================================
  // Announcing
  // ===========================================

  /**
   * Queues one banner per phase change, in the order they happened, and
   * starts showing them if nothing is up. Announcing nothing is a no-op,
   * so a store change that moved a unit never disturbs a banner already
   * on screen.
   */
  announce(changes: readonly PhaseAnnouncement[]): void {
    if (changes.length === 0) {
      return;
    }
    this.queue.push(...changes);
    if (this.showing === undefined) {
      this.advance();
    }
  }

  /** Dismisses the banner on screen and shows the next one, if any. */
  skip(): void {
    if (this.showing === undefined) {
      return;
    }
    this.cancelTimer();
    this.advance();
  }

  /** The banner on screen, or undefined when idle. Test seam. */
  current(): PhaseAnnouncement | undefined {
    return this.showing;
  }

  /** How many banners are still waiting. Test seam. */
  pending(): number {
    return this.queue.length;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Shows the next queued banner, or goes idle when the queue is empty. */
  private advance(): void {
    this.previous = this.showing?.phase ?? this.previous;
    const next = this.queue.shift();
    this.showing = next;
    if (next === undefined) {
      this.hide();
      return;
    }
    this.render(next);
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      this.advance();
    }, this.holdMs);
  }

  /** Writes one announcement into the element and makes it visible. */
  private render(announcement: PhaseAnnouncement): void {
    const root = this.root;
    if (root === undefined) {
      return;
    }
    const afterBugs =
      announcement.phase === "player" && this.previous === "bugs";
    if (this.titleEl) {
      this.titleEl.textContent = TITLES[announcement.phase];
    }
    if (this.detailEl) {
      this.detailEl.textContent = afterBugs
        ? `The bugs have finished · Turn ${formatWhole(announcement.turn)}`
        : `Turn ${formatWhole(announcement.turn)}`;
    }
    root.hidden = false;
    root.dataset.phase = announcement.phase;
    root.dataset.visible = "true";
    // Restart the entry animation for a banner replacing another one.
    root.dataset.seq = String(Number(root.dataset.seq ?? "0") + 1);
  }

  /** Hides the element and drops its phase marking. */
  private hide(): void {
    const root = this.root;
    if (root === undefined) {
      return;
    }
    root.hidden = true;
    delete root.dataset.visible;
    delete root.dataset.phase;
  }

  /** Cancels a pending self-dismissal. */
  private cancelTimer(): void {
    if (this.timer !== undefined) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
  }
}

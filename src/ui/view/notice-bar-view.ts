import type { Notice, NoticeSink } from "../model/notice-sink";

// ===========================================
// NoticeBarView
// ===========================================

/**
 * A strip along the bottom of the window for messages that must survive
 * navigation (GDD §2: a lost campaign must never be silent). Mounted
 * once by the bootstrap outside every screen, at the bottom so it never
 * covers a screen's top bar; `notify` shows the latest notice until the
 * player dismisses it or a newer one replaces it.
 *
 * ```
 *   ├──────────────────── screen above ──────────────────────────────────┤
 *   └ ▮ Autosave failed: … Progress will not survive a reload.  [Dismiss] ┘
 * ```
 */
export class NoticeBarView implements NoticeSink {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private text: HTMLElement | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the hidden bar under `parent`. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const bar = doc.createElement("div");
    bar.id = "notices";
    bar.className = "tut-notice";
    bar.dataset.role = "notice";
    bar.setAttribute("role", "status");
    bar.hidden = true;

    const text = doc.createElement("span");
    text.className = "tut-notice__text";
    text.dataset.field = "notice-text";

    const dismiss = doc.createElement("button");
    dismiss.type = "button";
    dismiss.className = "tut-btn";
    dismiss.dataset.action = "dismiss-notice";
    dismiss.textContent = "Dismiss";
    const onDismiss = (): void => {
      this.dismiss();
    };
    dismiss.addEventListener("click", onDismiss);
    this.disposers.push(() => {
      dismiss.removeEventListener("click", onDismiss);
    });

    bar.append(text, dismiss);
    parent.appendChild(bar);
    this.root = bar;
    this.text = text;
  }

  /** Removes the bar and its listener. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.text = undefined;
  }

  // ===========================================
  // NoticeSink
  // ===========================================

  /** Shows `notice`, replacing whatever was showing. */
  notify(notice: Notice): void {
    if (!this.root || !this.text) {
      return;
    }
    this.text.textContent = notice.message;
    this.root.className = `tut-notice tut-notice--${notice.tone}`;
    this.root.dataset.tone = notice.tone;
    this.root.hidden = false;
  }

  /** Hides the bar until the next notice. */
  dismiss(): void {
    if (this.root) {
      this.root.hidden = true;
    }
  }
}

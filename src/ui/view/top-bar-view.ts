import type { GameState } from "../../save/model/game-state";
import { formatCredits, formatWhole } from "../service/format";
import { threatTone } from "../service/threat-band";

// ===========================================
// Types
// ===========================================

/** What the top bar reports back to its owner. */
export interface TopBarViewHandlers {
  /** The player pressed Advance Day. */
  readonly onAdvanceDay: () => void;
  /** The player asked for the main menu. */
  readonly onMainMenu: () => void;
}

// ===========================================
// TopBarView
// ===========================================

/**
 * The overworld's status strip: day, credits and threat on the left, the
 * campaign's navigation and Advance Day on the right. Built once in
 * `mount`; `update` rewrites only the text and colour band of the values
 * that can change, so a tick never rebuilds the bar.
 *
 * ```
 *   ┌ DAY 4 │ ¢5,120 │ THREAT 42 ▮warn ─────── status ── [Roster] [Main menu] [ADVANCE DAY] ┐
 * ```
 */
export class TopBarView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: TopBarViewHandlers;
  private root: HTMLElement | undefined;
  private day: HTMLElement | undefined;
  private credits: HTMLElement | undefined;
  private threat: HTMLElement | undefined;
  private threatBadge: HTMLElement | undefined;
  private outcome: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private advance: HTMLButtonElement | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Callbacks for the bar's buttons. */
  constructor(handlers: TopBarViewHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the bar under `parent` with empty values; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const bar = doc.createElement("header");
    bar.id = "top-bar";
    bar.className = "tut-topbar tut-overworld__bar";

    const day = this.createStat(doc, "Day", "day");
    const credits = this.createStat(doc, "Credits", "credits");
    const threat = this.createStat(doc, "Threat", "threat");
    const badge = doc.createElement("span");
    badge.className = "tut-badge";
    badge.dataset.field = "threat-tone";
    threat.stat.appendChild(badge);

    const outcome = doc.createElement("span");
    outcome.className = "tut-badge tut-badge--danger";
    outcome.dataset.field = "outcome";
    outcome.hidden = true;

    const spacer = doc.createElement("span");
    spacer.className = "tut-topbar__spacer";

    const status = doc.createElement("span");
    status.className = "tut-topbar__status tut-dim";
    status.dataset.role = "status";
    status.hidden = true;

    const roster = this.createButton(doc, "roster", "Roster", false);
    roster.disabled = true;
    roster.title = "The roster screen arrives with #79";
    const menu = this.createButton(doc, "main-menu", "Main menu", false);
    const advance = this.createButton(doc, "advance-day", "Advance day", true);
    advance.disabled = true;

    bar.append(
      day.stat,
      credits.stat,
      threat.stat,
      outcome,
      spacer,
      status,
      roster,
      menu,
      advance,
    );
    parent.appendChild(bar);

    this.listen(advance, this.handlers.onAdvanceDay);
    this.listen(menu, this.handlers.onMainMenu);

    this.root = bar;
    this.day = day.value;
    this.credits = credits.value;
    this.threat = threat.value;
    this.threatBadge = badge;
    this.outcome = outcome;
    this.status = status;
    this.advance = advance;
  }

  /**
   * Refreshes the values from `state`. With no campaign the readouts show
   * dashes and Advance Day is disabled; with an ended campaign the outcome
   * badge appears and Advance Day is disabled.
   */
  update(state: GameState | undefined): void {
    if (!this.day || !this.credits || !this.threat || !this.threatBadge) {
      return;
    }
    if (!state) {
      this.day.textContent = "—";
      this.credits.textContent = "—";
      this.threat.textContent = "—";
      this.threatBadge.hidden = true;
      this.setOutcome(undefined);
      this.setAdvanceEnabled(false);
      return;
    }
    const { overworld, economy } = state;
    this.setText(this.day, formatWhole(overworld.day));
    this.setText(this.credits, formatCredits(economy.credits));
    this.setText(this.threat, formatWhole(overworld.threat));
    const tone = threatTone(overworld.threat);
    this.threatBadge.hidden = false;
    this.threatBadge.className = `tut-badge tut-badge--${tone}`;
    this.setText(this.threatBadge, tone);
    this.threatBadge.dataset.tone = tone;
    this.setOutcome(overworld.outcome?.kind);
    this.setAdvanceEnabled(overworld.outcome === undefined);
  }

  /** Shows a one-line message in the bar (a rejected command, for instance). */
  showStatus(message: string): void {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    this.status.hidden = false;
  }

  /** Removes the bar and every listener added in `mount`. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.day = undefined;
    this.credits = undefined;
    this.threat = undefined;
    this.threatBadge = undefined;
    this.outcome = undefined;
    this.status = undefined;
    this.advance = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Label plus value cell; the value carries `data-field` for tests. */
  private createStat(
    doc: Document,
    label: string,
    field: string,
  ): { stat: HTMLElement; value: HTMLElement } {
    const stat = doc.createElement("span");
    stat.className = "tut-topbar__stat";
    const term = doc.createElement("span");
    term.className = "tut-label";
    term.textContent = label;
    const value = doc.createElement("span");
    value.className = "tut-data";
    value.dataset.field = field;
    value.textContent = "—";
    stat.append(term, value);
    return { stat, value };
  }

  /** Builds a themed button carrying its `data-action`. */
  private createButton(
    doc: Document,
    action: string,
    label: string,
    primary: boolean,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = primary ? "tut-btn tut-btn--primary" : "tut-btn";
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }

  /** Attaches a click handler and remembers how to remove it. */
  private listen(target: HTMLElement, handler: () => void): void {
    target.addEventListener("click", handler);
    this.disposers.push(() => {
      target.removeEventListener("click", handler);
    });
  }

  /** Writes text only when it changed, so unchanged nodes are left alone. */
  private setText(element: HTMLElement, text: string): void {
    if (element.textContent !== text) {
      element.textContent = text;
    }
  }

  /** Shows the outcome badge for an ended campaign, or hides it. */
  private setOutcome(kind: string | undefined): void {
    if (!this.outcome) {
      return;
    }
    if (kind === undefined) {
      this.outcome.hidden = true;
      return;
    }
    this.setText(this.outcome, `Campaign over · ${kind}`);
    this.outcome.hidden = false;
  }

  /** Enables or disables Advance Day. */
  private setAdvanceEnabled(enabled: boolean): void {
    if (this.advance) {
      this.advance.disabled = !enabled;
    }
  }
}

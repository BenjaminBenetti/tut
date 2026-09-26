import type { IconId } from "../data/icon-manifest";
import type { GameState } from "../../save/model/game-state";
import {
  formatCredits,
  formatTechPoints,
  formatWhole,
} from "../service/format";
import { stipendModifierSummary } from "../service/stipend-modifier-text";
import { threatTone } from "../service/threat-band";
import { GreatHiveTrackerView } from "./great-hive-tracker-view";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Types
// ===========================================

/** What the top bar reports back to its owner. */
export interface TopBarViewHandlers {
  /** The player pressed Advance Day. */
  readonly onAdvanceDay: () => void;
  /** The player asked for the main menu. */
  readonly onMainMenu: () => void;
  /** The player asked for the roster screen; absent when no roster screen is reachable. */
  readonly onRoster?: () => void;
  /** The player asked for the tech tree (#1171); absent when no tech tree screen is reachable. */
  readonly onTechTree?: () => void;
  /**
   * Back into a mission that is still in progress (#468). Omitted where
   * the bar has no tactical screen to return to.
   */
  readonly onResumeMission?: () => void;
}

// ===========================================
// TopBarView
// ===========================================

/**
 * The overworld's status strip: day, credits, tech points and threat on
 * the left, the campaign's navigation and Advance Day on the right.
 * Built once in `mount`; `update` rewrites only the text and colour
 * band of the values that can change, so a tick never rebuilds the bar.
 * While the stipend is scaled (an evacuation's +50% or −10%, an event's
 * window) a small badge beside the credits gives the net change and the
 * days to its next change; it is hidden otherwise. From the Great Hives'
 * reveal a count of the ones destroyed follows the threat
 * (`GreatHiveTrackerView`, #1179).
 *
 * ```
 *   ┌ DAY 4 │ ¢5,120 ▮+50% · 10 d │ TECH 42 TP │ THREAT 42 ▮warn │ GREAT HIVES 1 / 3 ── status ── [Roster] [Tech] [Main menu] [ADVANCE DAY] ┐
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
  private techPoints: HTMLElement | undefined;
  private threat: HTMLElement | undefined;
  private threatBadge: HTMLElement | undefined;
  private stipendBadge: HTMLElement | undefined;
  private stipendPercent: HTMLElement | undefined;
  private stipendDays: HTMLElement | undefined;
  private outcome: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private advance: HTMLButtonElement | undefined;
  private resume: HTMLButtonElement | undefined;
  private readonly greatHives = new GreatHiveTrackerView();
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

    const day = this.createStat(doc, "Day", "day", "day");
    const credits = this.createStat(doc, "Credits", "credits", "credits");
    const stipend = doc.createElement("span");
    stipend.className = "tut-badge";
    stipend.dataset.field = "stipend-modifier";
    stipend.hidden = true;
    const stipendPercent = doc.createElement("span");
    const stipendDays = doc.createElement("span");
    stipendDays.className = "tut-topbar__stipend-days";
    stipend.append(stipendPercent, stipendDays);
    credits.stat.appendChild(stipend);
    const techPoints = this.createStat(doc, "Tech", "techPoints", "ability");
    const threat = this.createStat(doc, "Threat", "threat", "threat");
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

    // Primary, and first of the buttons: a mission left mid-fight is the
    // most urgent thing the bar can offer (#468).
    const resume = this.createButton(
      doc,
      "resume-mission",
      "Resume mission",
      true,
    );
    resume.hidden = true;
    const roster = this.createButton(doc, "roster", "Roster", false);
    roster.disabled = this.handlers.onRoster === undefined;
    const techTree = this.createButton(doc, "tech-tree", "Tech", false);
    techTree.disabled = this.handlers.onTechTree === undefined;
    const menu = this.createButton(doc, "main-menu", "Main menu", false);
    const advance = this.createButton(doc, "advance-day", "Advance day", true);
    advance.disabled = true;

    bar.append(
      day.stat,
      credits.stat,
      techPoints.stat,
      threat.stat,
      this.greatHives.create(doc),
      outcome,
      spacer,
      status,
      resume,
      roster,
      techTree,
      menu,
      advance,
    );
    parent.appendChild(bar);

    this.listen(advance, this.handlers.onAdvanceDay);
    this.listen(menu, this.handlers.onMainMenu);
    if (this.handlers.onRoster) {
      this.listen(roster, this.handlers.onRoster);
    }
    if (this.handlers.onTechTree) {
      this.listen(techTree, this.handlers.onTechTree);
    }
    if (this.handlers.onResumeMission) {
      this.listen(resume, this.handlers.onResumeMission);
    }

    this.root = bar;
    this.day = day.value;
    this.credits = credits.value;
    this.techPoints = techPoints.value;
    this.threat = threat.value;
    this.threatBadge = badge;
    this.stipendBadge = stipend;
    this.stipendPercent = stipendPercent;
    this.stipendDays = stipendDays;
    this.outcome = outcome;
    this.status = status;
    this.advance = advance;
    this.resume = resume;
  }

  /**
   * Refreshes the values from `state`. With no campaign the readouts show
   * dashes and Advance Day is disabled; with an ended campaign the outcome
   * badge appears and Advance Day is disabled; while an event waits for
   * an answer Advance Day is disabled too (GDD §5.4).
   */
  update(state: GameState | undefined): void {
    if (
      !this.day ||
      !this.credits ||
      !this.techPoints ||
      !this.threat ||
      !this.threatBadge
    ) {
      return;
    }
    this.setResumeVisible(state?.activeMission !== undefined);
    if (!state) {
      this.day.textContent = "—";
      this.credits.textContent = "—";
      this.techPoints.textContent = "—";
      this.threat.textContent = "—";
      this.threatBadge.hidden = true;
      this.setStipend(undefined);
      this.greatHives.update(undefined);
      this.setOutcome(undefined);
      this.setAdvanceEnabled(false);
      return;
    }
    const { overworld, economy } = state;
    this.setText(this.day, formatWhole(overworld.day));
    this.setText(this.credits, formatCredits(economy.credits));
    // An ended campaign draws no more stipends, and its outcome badge
    // needs the room at 800 px.
    this.setStipend(
      overworld.outcome === undefined ? overworld.stipendModifiers : undefined,
    );
    this.setText(this.techPoints, formatTechPoints(economy.techPoints));
    this.setText(this.threat, formatWhole(overworld.threat));
    const tone = threatTone(overworld.threat);
    this.threatBadge.hidden = false;
    this.threatBadge.className = `tut-badge tut-badge--${tone}`;
    this.setText(this.threatBadge, tone);
    this.threatBadge.dataset.tone = tone;
    this.greatHives.update(overworld);
    this.setOutcome(overworld.outcome?.kind);
    const eventPending = overworld.pendingEvents.length > 0;
    this.setAdvanceEnabled(overworld.outcome === undefined && !eventPending);
    if (this.advance) {
      this.advance.title = eventPending ? "Answer the pending event first" : "";
    }
  }

  /**
   * Shows or hides Resume mission. Visible exactly while a mission is in
   * progress, and never when there is no handler to run it (#468).
   */
  private setResumeVisible(visible: boolean): void {
    if (this.resume) {
      this.resume.hidden =
        !visible || this.handlers.onResumeMission === undefined;
    }
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
    this.techPoints = undefined;
    this.threat = undefined;
    this.threatBadge = undefined;
    this.stipendBadge = undefined;
    this.stipendPercent = undefined;
    this.stipendDays = undefined;
    this.greatHives.release();
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
    icon?: IconId,
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
    if (icon === undefined) {
      stat.append(term, value);
      return { stat, value };
    }
    // The glyph carries the meaning and the word repeats it, so the
    // glyph is decorative and the label stays the accessible name (#495).
    const glyph = iconGlyph(doc, icon);
    stat.append(glyph, term, value);
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

  /**
   * Shows the stipend badge for the active modifiers, toned green while
   * the stipend is up and amber while it is down, with each modifier in
   * its tooltip; hides it when there are none. The days sit in their own
   * span so a narrow bar can drop them and keep the percentage.
   */
  private setStipend(
    modifiers: GameState["overworld"]["stipendModifiers"],
  ): void {
    if (!this.stipendBadge || !this.stipendPercent || !this.stipendDays) {
      return;
    }
    const summary = stipendModifierSummary(modifiers);
    if (summary === undefined) {
      this.stipendBadge.hidden = true;
      delete this.stipendBadge.dataset.tone;
      return;
    }
    this.setText(this.stipendPercent, summary.percent);
    this.setText(this.stipendDays, summary.days);
    this.stipendBadge.className = `tut-badge tut-badge--${summary.tone}`;
    this.stipendBadge.dataset.tone = summary.tone;
    this.stipendBadge.title = summary.title;
    this.stipendBadge.hidden = false;
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
